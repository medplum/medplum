// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import { isCustomOperationAvailable } from './operations';

describe('isCustomOperationAvailable', () => {
  test('true only for an OperationDefinition implemented by a Bot', async () => {
    const medplum = new MockClient();
    await medplum.createResource({
      resourceType: 'OperationDefinition',
      status: 'active',
      kind: 'operation',
      name: 'CandidSubmitClaim',
      code: 'candid-submit-claim',
      system: false,
      type: false,
      instance: true,
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation',
          valueReference: { reference: 'Bot/candid' },
        },
      ],
    });
    await medplum.createResource({
      resourceType: 'OperationDefinition',
      status: 'active',
      kind: 'operation',
      name: 'StediSubmitClaim',
      code: 'stedi-submit-claim',
      system: false,
      type: false,
      instance: true,
    });

    expect(await isCustomOperationAvailable(medplum, 'candid-submit-claim')).toBe(true);
    expect(await isCustomOperationAvailable(medplum, 'stedi-submit-claim')).toBe(false);
    expect(await isCustomOperationAvailable(medplum, 'missing')).toBe(false);
  });
});
