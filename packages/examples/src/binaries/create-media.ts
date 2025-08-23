// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

const arrayBuffer = await fetch('https://example.com/patient-report.pdf').then((res) => res.arrayBuffer());
const data: Uint8Array = new Uint8Array(arrayBuffer);
const patientId = '123';

// start-block createMedia
await medplum.createMedia({
  data,
  filename: 'patient-report.pdf',
  contentType: 'application/pdf',
  additionalFields: {
    subject: { reference: `Patient/${patientId}` },
  },
});
// end-block createMedia
