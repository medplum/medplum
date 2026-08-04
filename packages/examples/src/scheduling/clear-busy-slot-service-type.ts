// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block clearBusySlotServiceType
// Migration for medplum/medplum#9995 (and #9998): clear `serviceType` on busy /
// busy-unavailable Slots ending after a target date, so they keep blocking
// ALL services (the pre-fix behavior) instead of only the matching service.
// Chiefly cleans up Slots that $find/$book wrote a serviceType onto before
// #9998, which would otherwise allow double-booking once #9995's fix lands.
//
//   export MEDPLUM_BASE_URL='https://api.medplum.com/'
//   export MEDPLUM_CLIENT_ID='...'
//   export MEDPLUM_CLIENT_SECRET='...'
//   export TARGET_DATE='2026-09-01T00:00:00Z'   # your upgrade date
//
//   npx tsx clear-busy-slot-service-type.ts
//
// Dependencies: npm i @medplum/core tsx
import { MedplumClient } from '@medplum/core';

async function main(): Promise<void> {
  const targetDate = new Date(process.env.TARGET_DATE as string);
  const medplum = new MedplumClient({ baseUrl: process.env.MEDPLUM_BASE_URL });
  await medplum.startClientLogin(process.env.MEDPLUM_CLIENT_ID as string, process.env.MEDPLUM_CLIENT_SECRET as string);

  // Phase 1: gather affected slot IDs (fully drained before we mutate anything).
  // `service-type:missing=false` limits the scan to slots that carry a serviceType;
  // `end=gt...` uses Medplum's custom Slot end search parameter.
  const ids: string[] = [];
  for await (const page of medplum.searchResourcePages('Slot', {
    status: 'busy,busy-unavailable,busy-tentative',
    'service-type:missing': 'false',
    end: `gt${targetDate.toISOString()}`,
    _count: 1000,
  })) {
    for (const slot of page) {
      if (slot.id) {
        ids.push(slot.id);
      }
    }
  }
  console.log(`Found ${ids.length} slot(s) to update.`);

  // Phase 2: clear serviceType on each with a targeted JSON Patch (no re-read).
  for (const id of ids) {
    await medplum.patchResource('Slot', id, [{ op: 'remove', path: '/serviceType' }]);
    console.log(`Updated Slot/${id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
// end-block clearBusySlotServiceType
