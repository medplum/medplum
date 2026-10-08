// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block oooImports
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Coding, Communication, Task } from '@medplum/fhirtypes';
import { rerouteToPool } from './task-routing-examples';
// end-block oooImports

// start-block oooRerouteTs
export function createOutOfOfficeHandler(
  responseWorkType: Coding,
  isUnavailable: (owner: NonNullable<Task['owner']>) => Promise<boolean>
): (medplum: MedplumClient, event: BotEvent<Communication>) => Promise<void> {
  if (!responseWorkType.system || !responseWorkType.code) {
    throw new Error('Configure a coded response work type');
  }
  return async (medplum, event) => {
    const threadRef = event.input.partOf?.[0]?.reference;
    if (!threadRef) {
      return;
    }
    for await (const page of medplum.searchResourcePages('Task', {
      focus: threadRef,
      code: `${responseWorkType.system}|${responseWorkType.code}`,
      status: 'ready,accepted,in-progress',
      'owner:missing': false,
    })) {
      for (const task of page) {
        const role = task.performerType?.[0];
        if (
          !task.owner?.reference ||
          task.performerType?.length !== 1 ||
          !role?.coding?.some((c) => c.system && c.code)
        ) {
          continue;
        }
        if (!(await isUnavailable(task.owner))) {
          continue;
        }
        // A stale Task version fails the update. Reevaluate before retrying.
        await rerouteToPool(medplum, task, role, {
          time: new Date().toISOString(),
          text: `Returned to the response pool: ${task.owner.display ?? task.owner.reference} is confirmed unavailable`,
        });
      }
    }
  };
}
// end-block oooRerouteTs
