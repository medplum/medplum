// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Organization, Parameters } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import {
  BILLING_ORGANIZATION_IDENTIFIER_VALUE,
  CANDID_ELIGIBILITY_PAYER_ID_SYSTEM,
  CANDID_ELIGIBILITY_SUPPORT_EXTENSION,
  CANDID_PAYER_CATEGORY_SYSTEM,
  CANDID_PAYER_UUID_SYSTEM,
  CHC_PAYER_ID_SYSTEM,
  CMS_PAYER_ID_SYSTEM,
  EIN_SYSTEM,
  MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM,
  NPI_SYSTEM,
  ORGANIZATION_TYPE_SYSTEM,
  PAYER_ORGANIZATION_TYPE,
  PROVIDER_ORGANIZATION_TYPE,
  buildPayerRefreshOps,
  buildUpdatedOrganization,
  formatPayerCategory,
  getPayerCategory,
  getPayerId,
  getPayerUuid,
  isPayerNotFoundError,
  isValidBillingPhone,
  isValidNpi,
  parsePayerSearchPage,
  upsertIdentifier,
  upsertPhone,
} from './billing';

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
  describe('isValidNpi', () => {
    test.each(['1234567893', '3564119220', '1679576722', '7778889999'])('accepts valid NPI %s', (npi) => {
      expect(isValidNpi(npi)).toBe(true);
    });

    test.each([
      ['1234567890', 'wrong check digit'],
      ['7778889990', 'wrong check digit'],
      ['123456789', 'too short'],
      ['12345678931', 'too long'],
      ['123456789X', 'non-digit'],
      ['', 'empty'],
    ])('rejects %s (%s)', (npi) => {
      expect(isValidNpi(npi)).toBe(false);
    });
  });

  describe('isValidBillingPhone', () => {
    test('accepts formatted 10-digit numbers', () => {
      expect(isValidBillingPhone('(212) 555-1234')).toBe(true);
      expect(isValidBillingPhone('9177773344')).toBe(true);
    });

    test('rejects numbers starting with 0 or 1', () => {
      expect(isValidBillingPhone('0125551234')).toBe(false);
      expect(isValidBillingPhone('1234567890')).toBe(false);
    });

    test('rejects wrong lengths', () => {
      expect(isValidBillingPhone('212555123')).toBe(false);
      expect(isValidBillingPhone('21255512345')).toBe(false);
      expect(isValidBillingPhone('')).toBe(false);
    });
  });

  describe('upsertIdentifier', () => {
    test('appends a new identifier', () => {
      expect(upsertIdentifier(undefined, NPI_SYSTEM, '3564119220')).toEqual([
        { system: NPI_SYSTEM, value: '3564119220' },
      ]);
    });

    test('replaces the value for the same system, preserving other systems and extra props', () => {
      const identifiers = [
        { system: 'https://example.com/other', value: 'keep-me' },
        { system: NPI_SYSTEM, value: '1234567893', use: 'official' as const },
      ];
      const result = upsertIdentifier(identifiers, NPI_SYSTEM, '3564119220');
      expect(result).toEqual([
        { system: 'https://example.com/other', value: 'keep-me' },
        { system: NPI_SYSTEM, value: '3564119220', use: 'official' },
      ]);
    });

    test('removes the identifier on empty value', () => {
      const identifiers = [{ system: NPI_SYSTEM, value: '1234567893' }];
      expect(upsertIdentifier(identifiers, NPI_SYSTEM, '  ')).toBeUndefined();
    });
  });

  describe('upsertPhone', () => {
    test('replaces the phone entry, preserving email entries', () => {
      const telecom = [
        { system: 'email' as const, value: 'billing@example.com' },
        { system: 'phone' as const, value: '0000000000', use: 'work' as const },
      ];
      expect(upsertPhone(telecom, '2125551234')).toEqual([
        { system: 'email', value: 'billing@example.com' },
        { system: 'phone', value: '2125551234', use: 'work' },
      ]);
    });

    test('appends when no phone exists and removes on empty', () => {
      expect(upsertPhone(undefined, '2125551234')).toEqual([{ system: 'phone', value: '2125551234' }]);
      expect(upsertPhone([{ system: 'phone', value: '2125551234' }], '')).toBeUndefined();
    });
  });

  describe('buildUpdatedOrganization', () => {
    test('builds a new billing organization with prov type, identifiers, and digits-only EIN', () => {
      const result = buildUpdatedOrganization(
        { resourceType: 'Organization' },
        {
          name: ' Test Medical Practice LLC ',
          npi: '3564119220',
          ein: '12-3456789',
          phone: '6175550142',
          address: { line: ['456 Medical Center Drive'], city: 'Boston', state: 'MA', postalCode: '02101' },
        }
      );

      expect(result.name).toBe('Test Medical Practice LLC');
      expect(result.identifier).toEqual([
        { system: NPI_SYSTEM, value: '3564119220' },
        { system: EIN_SYSTEM, value: '123456789' },
        { system: MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, value: BILLING_ORGANIZATION_IDENTIFIER_VALUE },
      ]);
      expect(result.type).toEqual([
        {
          coding: [
            { system: ORGANIZATION_TYPE_SYSTEM, code: PROVIDER_ORGANIZATION_TYPE, display: 'Healthcare Provider' },
          ],
        },
      ]);
      expect(result.telecom).toEqual([{ system: 'phone', value: '6175550142' }]);
      expect(result.address?.[0]?.city).toBe('Boston');
    });

    test('does not duplicate the prov type or clobber unrelated identifiers and types', () => {
      const existing: Organization = {
        resourceType: 'Organization',
        id: 'org-1',
        name: 'Old Name',
        type: [
          { coding: [{ system: ORGANIZATION_TYPE_SYSTEM, code: PROVIDER_ORGANIZATION_TYPE }] },
          { coding: [{ system: 'https://example.com/custom-type', code: 'clinic' }] },
        ],
        identifier: [
          { system: 'https://example.com/legacy-id', value: 'legacy' },
          { system: NPI_SYSTEM, value: '1234567893' },
        ],
      };

      const result = buildUpdatedOrganization(existing, {
        name: 'New Name',
        npi: '3564119220',
        ein: '123456789',
        phone: '',
      });

      expect(result.id).toBe('org-1');
      expect(result.type).toHaveLength(2);
      expect(result.identifier).toEqual([
        { system: 'https://example.com/legacy-id', value: 'legacy' },
        { system: NPI_SYSTEM, value: '3564119220' },
        { system: EIN_SYSTEM, value: '123456789' },
        { system: MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, value: BILLING_ORGANIZATION_IDENTIFIER_VALUE },
      ]);
      expect(result.telecom).toBeUndefined();
    });

    test('adds the prov type to an organization that has other types only', () => {
      const existing: Organization = {
        resourceType: 'Organization',
        type: [{ coding: [{ system: 'https://example.com/custom-type', code: 'clinic' }] }],
      };
      const result = buildUpdatedOrganization(existing, { name: 'X', npi: '3564119220', ein: '123456789', phone: '' });
      expect(result.type).toHaveLength(2);
      expect(
        result.type?.some((t) =>
          t.coding?.some((c) => c.system === ORGANIZATION_TYPE_SYSTEM && c.code === PROVIDER_ORGANIZATION_TYPE)
        )
      ).toBe(true);
    });

    test('stamps the provider marker identifier exactly once across repeated saves', () => {
      const first = buildUpdatedOrganization(
        { resourceType: 'Organization' },
        { name: 'X', npi: '3564119220', ein: '123456789', phone: '' }
      );
      const second = buildUpdatedOrganization(first, { name: 'X', npi: '3564119220', ein: '123456789', phone: '' });
      const markers = second.identifier?.filter((id) => id.system === MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM);
      expect(markers).toEqual([
        { system: MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, value: BILLING_ORGANIZATION_IDENTIFIER_VALUE },
      ]);
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

  describe('payer Organization getters', () => {
    test('reads the Candid UUID and claims payer ID', () => {
      const payer = makeDirectoryPayer();
      expect(getPayerUuid(payer)).toBe('uuid-1');
      expect(getPayerId(payer)).toBe('60054');
    });

    test('falls back to the legacy CMS payer ID for pre-v4 imports', () => {
      const legacy = makeDirectoryPayer({ identifier: [{ system: CMS_PAYER_ID_SYSTEM, value: '62308' }] });
      expect(getPayerId(legacy)).toBe('62308');
    });

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
