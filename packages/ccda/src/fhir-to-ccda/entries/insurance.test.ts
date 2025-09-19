// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import { Account, Bundle, Composition, Coverage, Organization, Patient, RelatedPerson } from '@medplum/fhirtypes';
import { FhirToCcdaConverter } from '../convert';
import { createInsuranceEntry } from './insurance';

describe('createInsuranceEntry', () => {
  let converter: FhirToCcdaConverter;
  let bundle: Bundle;
  let patient: Patient;

  beforeEach(() => {
    patient = {
      id: 'patient-1',
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    };

    bundle = {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        { resource: patient },
        {
          resource: {
            id: 'composition-1',
            resourceType: 'Composition',
            status: 'final',
            type: { text: 'test' },
            date: new Date().toISOString(),
            author: [{ display: 'test' }],
            title: 'test',
            subject: createReference(patient),
            section: [],
          } as Composition,
        },
      ],
    };

    converter = new FhirToCcdaConverter(bundle);
  });

  test('should return entry for account without coverage', () => {
    const account: Account = {
      id: 'account-1',
      resourceType: 'Account',
      status: 'active',
    };

    const result = createInsuranceEntry(converter, account);

    expect(result).toBeDefined();
    expect(result?.act?.[0]).toBeDefined();
    expect(result?.act?.[0]?.['@_classCode']).toBe('ACT');
    expect(result?.act?.[0]?.['@_moodCode']).toBe('EVN');
    expect(result?.act?.[0]?.code?.['@_code']).toBe('48768-6');
    expect(result?.act?.[0]?.code?.['@_displayName']).toBe('Payment Sources');
    expect(result?.act?.[0]?.statusCode?.['@_code']).toBe('completed');
  });

  test('should return entry for account with coverage', () => {
    const organization: Organization = {
      id: 'org-1',
      resourceType: 'Organization',
      name: 'Test Insurance Company',
      address: [{ line: ['123 Insurance St'], city: 'Insurance City', state: 'IC', postalCode: '12345' }],
      telecom: [{ system: 'phone', value: '555-0123' }],
    };

    const relatedPerson: RelatedPerson = {
      id: 'related-1',
      resourceType: 'RelatedPerson',
      patient: createReference(patient),
      name: [{ given: ['Jane'], family: 'Doe' }],
      birthDate: '1985-01-01',
      address: [{ line: ['456 Policy St'], city: 'Policy City', state: 'PC', postalCode: '54321' }],
      identifier: [{ value: '888009335' }],
    };

    const coverage: Coverage = {
      id: 'coverage-1',
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: createReference(patient),
      payor: [createReference(organization)],
      policyHolder: createReference(relatedPerson),
      type: {
        coding: [
          {
            code: 'HMO',
            display: 'Health Maintenance Organization',
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          },
        ],
      },
      class: [
        {
          type: { coding: [{ code: 'plan' }] },
          value: 'Test Plan',
        },
      ],
      identifier: [{ value: 'coverage-123' }],
    };

    const account: Account = {
      id: 'account-1',
      resourceType: 'Account',
      status: 'active',
      coverage: [{ coverage: createReference(coverage) }],
      identifier: [{ value: 'account-123' }],
    };

    // Add resources to bundle
    bundle.entry?.push({ resource: organization }, { resource: relatedPerson }, { resource: coverage });

    const result = createInsuranceEntry(converter, account);

    expect(result).toBeDefined();
    expect(result?.act?.[0]?.entryRelationship).toBeDefined();
    expect(result?.act?.[0]?.entryRelationship?.length).toBe(1);

    const entryRel = result?.act?.[0]?.entryRelationship?.[0];
    expect(entryRel?.['@_typeCode']).toBe('COMP');
    expect(entryRel?.act?.[0]?.['@_classCode']).toBe('ACT');
    expect(entryRel?.act?.[0]?.['@_moodCode']).toBe('EVN');

    // Check policy activity
    const policyAct = entryRel?.act?.[0];
    expect(policyAct?.code?.['@_code']).toBe('71');
    expect(policyAct?.code?.['@_displayName']).toBe('Health Maintenance Organization');

    // Check performer (payor)
    expect(policyAct?.performer).toBeDefined();
    expect(policyAct?.performer?.[0]?.['@_typeCode']).toBe('PRF');
    expect(policyAct?.performer?.[0]?.assignedEntity?.representedOrganization?.name?.[0]).toBe(
      'Test Insurance Company'
    );

    // Check participants
    expect(policyAct?.participant).toBeDefined();
    expect(policyAct?.participant?.length).toBe(2);

    // Check covered party participant
    const coveredParty = policyAct?.participant?.[0];
    expect(coveredParty?.['@_typeCode']).toBe('COV');
    expect(coveredParty?.participantRole?.['@_classCode']).toBe('PAT');
    expect(coveredParty?.participantRole?.code?.['@_code']).toBe('FAMDEP');
    // Participant role structure varies based on mapNames implementation
    expect(coveredParty?.participantRole?.playingEntity?.name).toBeDefined();

    // Check policy holder participant
    const policyHolder = policyAct?.participant?.[1];
    expect(policyHolder?.['@_typeCode']).toBe('HLD');
    // Policy holder structure varies based on mapNames implementation
    expect(policyHolder?.participantRole?.playingEntity?.name).toBeDefined();

    // Check entry relationship for policy reference
    expect(policyAct?.entryRelationship).toBeDefined();
    expect(policyAct?.entryRelationship?.[0]?.['@_typeCode']).toBe('REFR');
    expect(policyAct?.entryRelationship?.[0]?.act?.[0]?.code?.['@_code']).toBe('PAYOR');
    expect(policyAct?.entryRelationship?.[0]?.act?.[0]?.text?.['#text']).toBe('Test Plan');
  });

  test('should handle coverage without payor', () => {
    const coverage: Coverage = {
      id: 'coverage-1',
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: createReference(patient),
      payor: [{ display: 'Test Payor' }],
      type: {
        coding: [
          {
            code: 'PPO',
            display: 'Preferred Provider Organization',
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          },
        ],
      },
    };

    const account: Account = {
      id: 'account-1',
      resourceType: 'Account',
      status: 'active',
      coverage: [{ coverage: createReference(coverage) }],
    };

    bundle.entry?.push({ resource: coverage });

    const result = createInsuranceEntry(converter, account);

    expect(result).toBeDefined();
    expect(result?.act?.[0]?.entryRelationship?.length).toBe(1);

    const policyAct = result?.act?.[0]?.entryRelationship?.[0]?.act?.[0];
    expect(policyAct?.code?.['@_code']).toBe('72');
    expect(policyAct?.performer?.[0]?.assignedEntity?.representedOrganization?.name).toBeUndefined();
  });

  test('should handle account without coverage array', () => {
    const account: Account = {
      id: 'account-1',
      resourceType: 'Account',
      status: 'active',
    };

    const result = createInsuranceEntry(converter, account);

    expect(result).toBeDefined();
    expect(result?.act?.[0]?.entryRelationship).toEqual([]);
  });

  test('should skip invalid coverage references', () => {
    const account: Account = {
      id: 'account-1',
      resourceType: 'Account',
      status: 'active',
      coverage: [
        { coverage: { reference: 'Coverage/nonexistent' } },
        { coverage: { reference: 'Patient/patient-1' } }, // Wrong resource type
      ],
    };

    const result = createInsuranceEntry(converter, account);

    expect(result).toBeDefined();
    expect(result?.act?.[0]?.entryRelationship).toEqual([]);
  });

  test('should handle coverage without plan class', () => {
    const coverage: Coverage = {
      id: 'coverage-1',
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: createReference(patient),
      payor: [{ display: 'Test Payor' }],
      type: {
        coding: [{ code: 'UNKNOWN', display: 'Unknown' }],
      },
    };

    const account: Account = {
      id: 'account-1',
      resourceType: 'Account',
      status: 'active',
      coverage: [{ coverage: createReference(coverage) }],
    };

    bundle.entry?.push({ resource: coverage });

    const result = createInsuranceEntry(converter, account);

    expect(result).toBeDefined();
    const policyAct = result?.act?.[0]?.entryRelationship?.[0]?.act?.[0];
    expect(policyAct?.entryRelationship?.[0]?.act?.[0]?.text).toBeUndefined();
  });
});
