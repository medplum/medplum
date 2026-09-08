// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Organization, Parameters } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import {
  ORGANIZATION_TYPE_SYSTEM,
  PAYER_ORGANIZATION_TYPE,
  buildPayerRefreshOps,
  formatPayerCategory,
  getPayerCategory,
  isPayerNotFoundError,
  parsePayerSearchPage,
  upsertIdentifier,
} from './billing';
import {
  CANDID_ELIGIBILITY_PAYER_ID_SYSTEM,
  CANDID_ELIGIBILITY_SUPPORT_EXTENSION,
  CANDID_PAYER_CATEGORY_SYSTEM,
  CANDID_PAYER_UUID_SYSTEM,
  CHC_PAYER_ID_SYSTEM,
  CMS_PAYER_ID_SYSTEM,
} from './candid';

// A payer Organization as the candid-get-payers bot builds it from Candid's payers.v4 API.
function makeDirectoryPayer(overrides: Partial<Organization> = {}): Organization {
  return {
    resourceType: 'Organization',
    active: true,
    name: 'AETNA',
    identifier: [
      { system: CANDID_PAYER_UUID_SYSTEM, value: 'uuid-1' },
      { system: CHC_PAYER_ID_SYSTEM, value: '60054' },
    ],
    type: [{ coding: [{ system: ORGANIZATION_TYPE_SYSTEM, code: PAYER_ORGANIZATION_TYPE, display: 'Payer' }] }],
    ...overrides,
  };
}

describe('billing utils', () => {
  describe('upsertIdentifier', () => {
    test('appends a new identifier', () => {
      expect(upsertIdentifier(undefined, CHC_PAYER_ID_SYSTEM, '60054')).toEqual([
        { system: CHC_PAYER_ID_SYSTEM, value: '60054' },
      ]);
    });

    test('replaces the value for the same system, preserving other systems and extra props', () => {
      const identifiers = [
        { system: 'https://example.com/other', value: 'keep-me' },
        { system: CHC_PAYER_ID_SYSTEM, value: '60054', use: 'official' as const },
      ];
      const result = upsertIdentifier(identifiers, CHC_PAYER_ID_SYSTEM, '62308');
      expect(result).toEqual([
        { system: 'https://example.com/other', value: 'keep-me' },
        { system: CHC_PAYER_ID_SYSTEM, value: '62308', use: 'official' },
      ]);
    });

    test('removes the identifier on empty value', () => {
      const identifiers = [{ system: CHC_PAYER_ID_SYSTEM, value: '60054' }];
      expect(upsertIdentifier(identifiers, CHC_PAYER_ID_SYSTEM, '  ')).toBeUndefined();
    });
  });

  describe('buildPayerRefreshOps', () => {
    const importedPayer: Organization = { ...makeDirectoryPayer(), id: 'org-1' };

    test('returns no ops when the payer is unchanged', () => {
      expect(buildPayerRefreshOps(importedPayer, makeDirectoryPayer())).toEqual([]);
    });

    test('patches a changed name and payer ID, preserving the Candid UUID', () => {
      const ops = buildPayerRefreshOps(
        importedPayer,
        makeDirectoryPayer({
          name: 'AETNA HEALTH',
          identifier: [
            { system: CANDID_PAYER_UUID_SYSTEM, value: 'uuid-1' },
            { system: CHC_PAYER_ID_SYSTEM, value: '99999' },
          ],
        })
      );
      expect(ops).toEqual([
        { op: 'add', path: '/name', value: 'AETNA HEALTH' },
        {
          op: 'add',
          path: '/identifier',
          value: [
            { system: CANDID_PAYER_UUID_SYSTEM, value: 'uuid-1' },
            { system: CHC_PAYER_ID_SYSTEM, value: '99999' },
          ],
        },
      ]);
    });

    test('migrates a legacy import: adds the CHC payer ID, preserving the CMS identifier', () => {
      const legacy: Organization = {
        ...importedPayer,
        identifier: [
          { system: CANDID_PAYER_UUID_SYSTEM, value: 'uuid-1' },
          { system: CMS_PAYER_ID_SYSTEM, value: '60054' },
        ],
      };
      const ops = buildPayerRefreshOps(legacy, makeDirectoryPayer());
      expect(ops).toEqual([
        {
          op: 'add',
          path: '/identifier',
          value: [
            { system: CMS_PAYER_ID_SYSTEM, value: '60054' },
            { system: CANDID_PAYER_UUID_SYSTEM, value: 'uuid-1' },
            { system: CHC_PAYER_ID_SYSTEM, value: '60054' },
          ],
        },
      ]);
    });

    test('syncs new directory metadata: capability IDs, category, aliases, address, extensions', () => {
      const fresh = makeDirectoryPayer({
        identifier: [
          { system: CANDID_PAYER_UUID_SYSTEM, value: 'uuid-1' },
          { system: CHC_PAYER_ID_SYSTEM, value: '60054' },
          { system: CANDID_ELIGIBILITY_PAYER_ID_SYSTEM, value: 'ELIG-1' },
        ],
        type: [
          { coding: [{ system: ORGANIZATION_TYPE_SYSTEM, code: PAYER_ORGANIZATION_TYPE, display: 'Payer' }] },
          { coding: [{ system: CANDID_PAYER_CATEGORY_SYSTEM, code: 'AETNA_AFFILIATED' }] },
        ],
        alias: ['AETNA HEALTH INC'],
        address: [{ line: ['PO Box 981106'], city: 'El Paso', state: 'TX', postalCode: '79998' }],
        extension: [{ url: CANDID_ELIGIBILITY_SUPPORT_EXTENSION, valueCode: 'SUPPORTED_ENROLLMENT_NOT_REQUIRED' }],
      });
      const ops = buildPayerRefreshOps(importedPayer, fresh);
      expect(ops).toEqual([
        { op: 'add', path: '/identifier', value: fresh.identifier },
        { op: 'add', path: '/type', value: fresh.type },
        { op: 'add', path: '/alias', value: fresh.alias },
        { op: 'add', path: '/address', value: fresh.address },
        { op: 'add', path: '/extension', value: fresh.extension },
      ]);
    });

    test('drops managed fields the directory no longer reports, preserving foreign extensions', () => {
      const org: Organization = {
        ...importedPayer,
        alias: ['OLD ALIAS'],
        extension: [
          { url: 'https://example.com/custom', valueString: 'keep-me' },
          { url: CANDID_ELIGIBILITY_SUPPORT_EXTENSION, valueCode: 'NOT_SUPPORTED' },
        ],
      };
      const ops = buildPayerRefreshOps(org, makeDirectoryPayer());
      expect(ops).toEqual([
        { op: 'remove', path: '/alias' },
        { op: 'add', path: '/extension', value: [{ url: 'https://example.com/custom', valueString: 'keep-me' }] },
      ]);
    });

    test('reactivates a payer that is back in the directory', () => {
      const ops = buildPayerRefreshOps({ ...importedPayer, active: false }, makeDirectoryPayer());
      expect(ops).toEqual([{ op: 'add', path: '/active', value: true }]);
    });
  });

  describe('isPayerNotFoundError', () => {
    test('matches the not-found error shapes from the candid-get-payers bot', () => {
      expect(isPayerNotFoundError(new Error('Candid payer fetch (uuid-1) failed (EntityNotFoundError): {}'))).toBe(
        true
      );
      expect(isPayerNotFoundError(new Error('Candid payer fetch (uuid-1) failed (HTTP 404): {"message":"gone"}'))).toBe(
        true
      );
      expect(isPayerNotFoundError(new Error('Candid payer fetch (uuid-1) failed (HTTP 401): unauthorized'))).toBe(
        false
      );
      expect(isPayerNotFoundError(new Error('network timeout'))).toBe(false);
    });
  });

  describe('parsePayerSearchPage', () => {
    test('extracts the payer Organizations and next-page token from the bot Parameters', () => {
      const result: Parameters = {
        resourceType: 'Parameters',
        parameter: [
          { name: 'organization', resource: makeDirectoryPayer() },
          { name: 'organization', resource: makeDirectoryPayer({ name: 'CIGNA' }) },
          { name: 'nextPageToken', valueString: 'tok-2' },
        ],
      };
      const page = parsePayerSearchPage(result);
      expect(page.items.map((org) => org.name)).toEqual(['AETNA', 'CIGNA']);
      expect(page.nextPageToken).toBe('tok-2');
    });

    test('returns an empty page with no token for an empty Parameters', () => {
      expect(parsePayerSearchPage({ resourceType: 'Parameters' })).toEqual({ items: [], nextPageToken: undefined });
    });
  });

  describe('getPayerCategory', () => {
    test('reads the payer category from Organization.type', () => {
      const payer = makeDirectoryPayer({
        type: [
          { coding: [{ system: ORGANIZATION_TYPE_SYSTEM, code: PAYER_ORGANIZATION_TYPE, display: 'Payer' }] },
          { coding: [{ system: CANDID_PAYER_CATEGORY_SYSTEM, code: 'MEDICARE' }] },
        ],
      });
      expect(getPayerCategory(payer)).toBe('MEDICARE');
      expect(getPayerCategory(makeDirectoryPayer())).toBeUndefined();
    });
  });

  describe('formatPayerCategory', () => {
    test.each([
      ['MEDICARE', 'Medicare'],
      ['AETNA_AFFILIATED', 'Aetna Affiliated'],
      ['WORKERS_COMP', 'Workers Comp'],
      ['BCBS', 'BCBS'],
      ['AUTO_TPL', 'Auto TPL'],
      ['SNF', 'SNF'],
    ])('formats %s as %s', (code, expected) => {
      expect(formatPayerCategory(code)).toBe(expected);
    });
  });
});
