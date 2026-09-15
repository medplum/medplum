// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Contract } from '@medplum/fhirtypes';
import { getContractPayerNames, isContractInForce } from './candid';

const today = new Date('2026-09-08T12:00:00Z');

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return { resourceType: 'Contract', status: 'executed', applies: { start: '2026-01-01' }, ...overrides };
}

describe('isContractInForce', () => {
  test('executed with no end date', () => {
    expect(isContractInForce(makeContract(), today)).toBe(true);
  });

  test('executed and today within the window', () => {
    expect(isContractInForce(makeContract({ applies: { start: '2026-09-08', end: '2026-09-08' } }), today)).toBe(true);
  });

  test('executed but expired', () => {
    expect(isContractInForce(makeContract({ applies: { start: '2026-01-01', end: '2026-09-07' } }), today)).toBe(false);
  });

  test('executed but not yet started', () => {
    expect(isContractInForce(makeContract({ applies: { start: '2026-09-09' } }), today)).toBe(false);
  });

  test('pending (offered) contract', () => {
    expect(isContractInForce(makeContract({ status: 'offered' }), today)).toBe(false);
  });

  test('missing applies', () => {
    expect(isContractInForce(makeContract({ applies: undefined }), today)).toBe(false);
  });
});

describe('getContractPayerNames', () => {
  test('dedupes payer names in order', () => {
    const contracts = [
      makeContract({ authority: [{ display: 'Aetna' }] }),
      makeContract({ authority: [{ display: 'Cigna' }] }),
      makeContract({ authority: [{ display: 'Aetna' }] }),
      makeContract({ authority: [{ identifier: { value: 'x' } }] }),
    ];
    expect(getContractPayerNames(contracts)).toEqual(['Aetna', 'Cigna']);
  });
});
