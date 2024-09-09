import { BotEvent, getReferenceString, MedplumClient } from '@medplum/core';
import { DiagnosticReport, Task } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<DiagnosticReport>): Promise<boolean> {
  const report = event.input as DiagnosticReport;

  if (report.status !== 'preliminary') {
    throw new Error('Unexpected input. DiagnosticReport not in preliminary status');
  }

  const task: Task = {
    resourceType: 'Task',
    code: {
      text: 'Review Diagnostic Report',
    },
    status: 'ready',
    intent: 'order',
    priority: 'asap',
    focus: {
      // The focus of the resource will be the DiagnosticReport
      reference: getReferenceString(report),
    },
    for: report.subject,
    // The performer type is a medical practitioner. This will ensure it is assigned to the correct queue so a doctor can review it.
    performerType: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '158965000',
            display: 'Doctor',
          },
        ],
      },
    ],
  };

  // Create the task and persist to the server
  await medplum.createResource(task);
  return true;
}
