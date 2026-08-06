// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import { AstmMessage } from '@medplum/core';
import type { Observation } from '@medplum/fhirtypes';

/**
 * Turns one ASTM E1394 transmission from a lab instrument into `Observation` resources.
 *
 * A byte-stream agent channel configured with `mode=astm` delivers the whole `ENQ`…`EOT`
 * transmission as one `x-application/astm-e1394` request, already stripped of E1381 framing and
 * with each frame's checksum validated. The body is record text, so parse it here.
 *
 * @param medplum - The Medplum client.
 * @param event - The bot event, whose input is ASTM record text.
 * @returns The created Observations.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<string>): Promise<Observation[]> {
  const message = AstmMessage.parse(event.input);

  // R records carry results: R|<seq>|^^^<testId>|<value>|<units>|...
  const created: Observation[] = [];
  for (const record of message.getRecords('R')) {
    const fields = record.text.split('|');
    const testId = fields[2]?.split('^').pop();
    const value = Number.parseFloat(fields[3]);

    if (!testId || Number.isNaN(value)) {
      console.log(`Skipping unparseable result record: ${record.text}`);
      continue;
    }

    created.push(
      await medplum.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ code: testId }], text: testId },
        valueQuantity: { value, unit: fields[4] },
      })
    );
  }

  return created;
}
