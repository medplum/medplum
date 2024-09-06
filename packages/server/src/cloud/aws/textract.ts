import { ComprehendMedicalClient, DetectEntitiesV2Command } from '@aws-sdk/client-comprehendmedical';
import {
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  TextractClient,
} from '@aws-sdk/client-textract';
import { ContentType, allOk, badRequest, getReferenceString, sleep } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Binary, Media } from '@medplum/fhirtypes';
import { Readable } from 'stream';
import { getConfig } from '../../config';
import { getAuthenticatedContext, getLogger } from '../../context';
import { Repository } from '../../fhir/repo';
import { getBinaryStorage } from '../../fhir/storage';
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

  const { id } = req.params;
  const inputMedia = await repo.readResource<Media>('Media', id);
  const inputBinary = await repo.readReference<Binary>({ reference: inputMedia.content.url });

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
    subject: inputMedia.subject,
  };

  const textractMedia = await createBinaryAndMedia(
    repo,
    JSON.stringify(textractResult, null, 2),
    ContentType.JSON,
    'textract.json',
    mediaProps
  );

  if (textractResult?.Blocks) {
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

  return [allOk, textractMedia];
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
