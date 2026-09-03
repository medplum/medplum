// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CapabilityStatementRestResource } from '@medplum/fhirtypes';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { buildCapabilityStatement } from './metadata';
import { loadStructureDefinitions } from './structure';

describe('CapabilityStatement', () => {
  let config: MedplumServerConfig;

  beforeAll(async () => {
    loadStructureDefinitions();
    config = await loadTestConfig();
  });

  afterEach(() => {
    config.capabilityStatement = undefined;
  });

  function getResource(type: string): CapabilityStatementRestResource | undefined {
    return buildCapabilityStatement().rest?.[0].resource?.find((r) => r.type === type);
  }

  test('Default statement', () => {
    const stmt = buildCapabilityStatement();
    expect(stmt.resourceType).toStrictEqual('CapabilityStatement');
    expect(stmt.title).toStrictEqual('Medplum Capability Statement');
    expect(stmt.rest?.[0].interaction).toStrictEqual([{ code: 'transaction' }, { code: 'batch' }]);

    const patient = getResource('Patient');
    expect(patient).toBeDefined();
    expect(patient?.interaction?.map((i) => i.code)).toContain('create');
    expect(patient?.searchParam?.length).toBeGreaterThan(0);
    expect(patient?.supportedProfile?.length).toBeGreaterThan(0);
    expect(getResource('Claim')).toBeDefined();

    expect(getResource('Questionnaire')?.operation).toContainEqual({
      name: 'assemble',
      definition: 'http://hl7.org/fhir/uv/sdc/OperationDefinition/Questionnaire-assemble',
    });
  });

  test('Include resource types', () => {
    config.capabilityStatement = { includeResourceTypes: ['Patient', 'Observation'] };
    const resources = buildCapabilityStatement().rest?.[0].resource;
    expect(resources?.map((r) => r.type).sort()).toStrictEqual(['Observation', 'Patient']);
  });

  test('Exclude resource types', () => {
    config.capabilityStatement = { excludeResourceTypes: ['Claim'] };
    expect(getResource('Claim')).toBeUndefined();
    expect(getResource('Patient')).toBeDefined();
  });

  test('Read-only endpoint', () => {
    config.capabilityStatement = {
      interactions: { '*': ['read', 'vread', 'search-type', 'history-instance'] },
      systemInteractions: [],
    };

    const stmt = buildCapabilityStatement();
    expect(stmt.rest?.[0].interaction).toBeUndefined();
    for (const resource of stmt.rest?.[0].resource ?? []) {
      expect(resource.interaction?.map((i) => i.code)).toStrictEqual([
        'read',
        'vread',
        'history-instance',
        'search-type',
      ]);
    }
  });

  test('Per resource type interactions', () => {
    config.capabilityStatement = {
      interactions: { '*': ['read', 'search-type'], DocumentReference: ['read', 'search-type', 'create'] },
    };
    expect(getResource('Patient')?.interaction?.map((i) => i.code)).toStrictEqual(['read', 'search-type']);
    expect(getResource('DocumentReference')?.interaction?.map((i) => i.code)).toStrictEqual([
      'read',
      'create',
      'search-type',
    ]);
  });

  test('Search parameters are still generated for included resource types', () => {
    config.capabilityStatement = { includeResourceTypes: ['Patient'], interactions: { '*': ['read'] } };
    const patient = getResource('Patient');
    expect(patient?.searchParam?.length).toBeGreaterThan(0);
    expect(patient?.profile).toStrictEqual('http://hl7.org/fhir/StructureDefinition/Patient');
  });

  test('Disable supported profiles', () => {
    config.capabilityStatement = { supportedProfiles: false };
    expect(getResource('Patient')?.supportedProfile).toBeUndefined();
  });

  test('Replace supported profiles per resource type', () => {
    config.capabilityStatement = {
      supportedProfiles: { Patient: ['http://example.com/custom-patient'] },
    };
    // Listed type is replaced
    expect(getResource('Patient')?.supportedProfile).toStrictEqual(['http://example.com/custom-patient']);
    // Unlisted type keeps generated defaults
    expect(getResource('Observation')?.supportedProfile?.length).toBeGreaterThan(0);
  });

  test('Add supported profiles to a type with none', () => {
    config.capabilityStatement = {
      supportedProfiles: { Claim: ['http://example.com/custom-claim'] },
    };
    expect(getResource('Claim')?.supportedProfile).toStrictEqual(['http://example.com/custom-claim']);
  });

  test('Empty array omits supported profiles for a type', () => {
    config.capabilityStatement = { supportedProfiles: { Patient: [] } };
    expect(getResource('Patient')?.supportedProfile).toBeUndefined();
  });

  test('Overlay', () => {
    config.capabilityStatement = {
      overlay: {
        id: 'acme-fhir',
        name: 'AcmeCapabilityStatement',
        title: 'Acme FHIR API',
        publisher: 'Acme Health',
      },
    };

    const stmt = buildCapabilityStatement();
    expect(stmt.id).toStrictEqual('acme-fhir');
    expect(stmt.name).toStrictEqual('AcmeCapabilityStatement');
    expect(stmt.title).toStrictEqual('Acme FHIR API');
    expect(stmt.publisher).toStrictEqual('Acme Health');
    // Generated fields are preserved
    expect(stmt.fhirVersion).toStrictEqual('4.0.1');
    expect(stmt.rest?.[0].mode).toStrictEqual('server');
  });

  test('Overlay does not leak into subsequent builds', () => {
    config.capabilityStatement = { overlay: { title: 'Acme FHIR API' } };
    expect(buildCapabilityStatement().title).toStrictEqual('Acme FHIR API');

    config.capabilityStatement = undefined;
    expect(buildCapabilityStatement().title).toStrictEqual('Medplum Capability Statement');
  });
});
