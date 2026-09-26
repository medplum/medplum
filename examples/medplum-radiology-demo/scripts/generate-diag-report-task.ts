// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Seeds a radiology worklist Task:
//   npm run generate-task -- Patient/123 ImagingStudy/456
//
// Auth comes from the environment: MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID, MEDPLUM_CLIENT_SECRET.
import { MedplumClient } from '@medplum/core';
import type { ImagingStudy, Patient, Reference, Task } from '@medplum/fhirtypes';

const RADIOLOGY_SYSTEM = 'https://medplum.com/radiology-dictation';
const RADIOLOGY_TASK_CODE = 'read-imaging-study';

function parseReference<T extends Patient | ImagingStudy>(arg: string | undefined, resourceType: string): Reference<T> {
  if (!arg?.startsWith(`${resourceType}/`) || arg.split('/').length !== 2) {
    throw new Error(`Expected a ${resourceType} reference such as "${resourceType}/123", got "${arg ?? ''}"`);
  }
  return { reference: arg };
}

async function main(): Promise<void> {
  const [patientArg, imagingStudyArg] = process.argv.slice(2);
  const patient = parseReference<Patient>(patientArg, 'Patient');
  const imagingStudy = parseReference<ImagingStudy>(imagingStudyArg, 'ImagingStudy');

  const baseUrl = process.env.MEDPLUM_BASE_URL;
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;
  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error('Set MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET');
  }

  const medplum = new MedplumClient({ baseUrl });
  await medplum.startClientLogin(clientId, clientSecret);

  // Read both references so a typo fails here rather than showing an empty row in the worklist.
  const [patientResource, study] = await Promise.all([
    medplum.readReference(patient),
    medplum.readReference(imagingStudy),
  ]);

  const task = await medplum.createResource<Task>({
    resourceType: 'Task',
    status: 'ready',
    intent: 'order',
    identifier: [{ system: RADIOLOGY_SYSTEM, value: RADIOLOGY_TASK_CODE }],
    code: { text: study.description ?? 'Radiology read' },
    description: `Dictate report for ${study.description ?? imagingStudy.reference}`,
    for: { reference: `Patient/${patientResource.id}` },
    input: [
      {
        type: { text: 'ImagingStudy' },
        valueReference: { reference: `ImagingStudy/${study.id}` },
      },
    ],
  });

  console.log(`Created Task/${task.id} for ${patient.reference} / ${imagingStudy.reference}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
