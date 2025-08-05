// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, MedplumClient } from '@medplum/core';
import { Media } from '@medplum/fhirtypes';

// Some types for the AWS Textract response
// You can find these types in the AWS Textract documentation
// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-textract/Interface/GetDocumentTextDetectionCommandOutput/
type TextractBlock = { Text?: string };
type TextractResponse = { Blocks: TextractBlock[] };

export async function handler(medplum: MedplumClient, event: BotEvent<Partial<Media>>): Promise<string> {
  // This example bot expects a Media input
  // In your own application, you could grab the Media from a different source
  const media = event.input;

  // Send the media to AWS Textract via the Medplum `$aws-textract` operation
  // The operation will return the Textract results
  // The results will also be available as a FHIR Binary and FHIR Media
  // You can optionally include `comprehend: true` to send the Textract results to AWS Comprehend
  const textractResult = (await medplum.post(
    medplum.fhirUrl('Media', media.id as string, '$aws-textract'),
    {}
  )) as TextractResponse;

  // Convert the AWS Textract output to an array of string lines
  const lines = textractResult.Blocks.map((b) => b.Text).filter(Boolean);
  console.log(lines);
  return lines.join('\n');
}
