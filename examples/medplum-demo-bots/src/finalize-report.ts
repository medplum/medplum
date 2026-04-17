// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { EMPTY } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { DiagnosticReport } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Cast the Bot input as a Diagnostic report
  const report = event.input as DiagnosticReport;
  if (report.resourceType !== 'DiagnosticReport') {
    throw new Error('Unexpected input. Expected DiagnosticReport');
  }

  if (report.status !== 'final') {
    report.status = 'final';
    await medplum.updateResource(report);
  }

  for (const observationRef of report.result ?? EMPTY) {
    const observation = await medplum.readReference(observationRef);
    if (observation.status !== 'final') {
      observation.status = 'final';
      await medplum.updateResource(observation);
    }
  }
}
