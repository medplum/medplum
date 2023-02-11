import { BotEvent, MedplumClient } from '@medplum/core';
import { DiagnosticReport } from '@medplum/fhirtypes';

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

  if (report.result) {
    for (const observationRef of report.result) {
      const observation = await medplum.readReference(observationRef);
      if (observation.status !== 'final') {
        observation.status = 'final';
        await medplum.updateResource(observation);
      }
    }
  }
}
