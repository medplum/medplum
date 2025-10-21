// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ComprehendMedicalClient, DetectEntitiesV2Command } from '@aws-sdk/client-comprehendmedical';
import {
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  TextractClient,
} from '@aws-sdk/client-textract';
import { ContentType, allOk, badRequest, getReferenceString, sleep } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Binary, DocumentReference, Media, Resource } from '@medplum/fhirtypes';
import { Readable } from 'stream';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import type { Repository } from '../../fhir/repo';
import { getLogger } from '../../logger';
import { getBinaryStorage } from '../../storage/loader';
import { S3Storage } from './storage';

export async function awsTextractHandler(req: FhirRequest): Promise<FhirResponse> {
  const { project, repo } = getAuthenticatedContext();
  if (!project.features?.includes('aws-textract')) {
    return [badRequest('AWS Textract not enabled')];
  }

  const storage = getBinaryStorage();
  if (!(storage instanceof S3Storage)) {
    return [badRequest('AWS Textract requires S3 storage')];
  }

  const { resourceType, id } = req.params;

  // Validate that the resource type is supported
  if (resourceType !== 'Media' && resourceType !== 'DocumentReference') {
    return [badRequest(`AWS Textract operation is not supported for resource type: ${resourceType}`)];
  }

  let inputBinary: Binary;
  let subject: any;

  if (resourceType === 'Media') {
    const inputMedia = await repo.readResource<Media>('Media', id);
    inputBinary = await repo.readReference<Binary>({ reference: inputMedia.content.url });
    subject = inputMedia.subject;
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
  }

  const { awsRegion } = getConfig();
  const bucket = storage.bucket;
  const key = storage.getKey(inputBinary);

  const textractClient = new TextractClient({ region: awsRegion });
  const startResponse = await textractClient.send(
    new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: bucket,
          Name: key,
        },
      },
    })
  );

  let count = 0;
  let textractResult = undefined;

  try {
    while (!textractResult && count < 120) {
      count++;
      const response = await textractClient.send(
        new GetDocumentTextDetectionCommand({
          JobId: startResponse.JobId,
        })
      );
      if (response.JobStatus === 'IN_PROGRESS') {
        await sleep(1000);
        continue;
      }

      // Otherwise, we're done
      textractResult = response;
    }
  } catch (err: any) {
    getLogger().error('Error getting text detection:', err);
  }

  const mediaProps: Partial<Media> = {
    subject: subject,
  };

  await createBinaryAndMedia(
    repo,
    JSON.stringify(textractResult, null, 2),
    ContentType.JSON,
    'textract.json',
    mediaProps
  );

  const options = req.body as undefined | { comprehend?: boolean };
  if (options?.comprehend && textractResult?.Blocks) {
    const lines = textractResult.Blocks.map((b) => b.Text ?? '');
    const text = lines.join('\n');
    const comprehendMedicalClient = new ComprehendMedicalClient({ region: awsRegion });
    const comprehendResult = await comprehendMedicalClient.send(new DetectEntitiesV2Command({ Text: text }));
    await createBinaryAndMedia(
      repo,
      JSON.stringify(comprehendResult, null, 2),
      ContentType.JSON,
      'comprehend.json',
      mediaProps
    );
  }

  return [allOk, textractResult as unknown as Resource];
}

async function createBinaryAndMedia(
  repo: Repository,
  content: string,
  contentType: string,
  filename: string,
  mediaProps: Partial<Media>
): Promise<Media> {
  const binary = await repo.createResource<Binary>({
    resourceType: 'Binary',
    contentType,
  });

  await getBinaryStorage().writeBinary(binary, filename, contentType, Readable.from(content));

  const media = await repo.createResource<Media>({
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
