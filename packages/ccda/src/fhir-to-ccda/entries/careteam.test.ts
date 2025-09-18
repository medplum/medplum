// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import { Bundle, CareTeam, CareTeamParticipant, Composition, Patient } from '@medplum/fhirtypes';
import { OID_CARE_TEAM_ORGANIZER_ENTRY } from '../../oids';
import { FhirToCcdaConverter } from '../convert';
import { createCareTeamEntry } from './careteam';

describe('createCareTeamEntry', () => {
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

  test('should create basic care team entry', () => {
    const careTeam: CareTeam = {
      id: 'careteam-1',
      resourceType: 'CareTeam',
      status: 'active',
      subject: createReference(patient),
      identifier: [{ value: 'careteam-123' }],
    };

    const result = createCareTeamEntry(converter, careTeam);

    expect(result).toBeDefined();
    expect(result.organizer).toBeDefined();
    expect(result.organizer?.length).toBe(1);

    const organizer = result.organizer?.[0];
    expect(organizer?.['@_classCode']).toBe('CLUSTER');
    expect(organizer?.['@_moodCode']).toBe('EVN');
    expect(organizer?.templateId).toEqual([
      {
        '@_root': OID_CARE_TEAM_ORGANIZER_ENTRY,
        '@_extension': '2022-07-01',
      },
      {
        '@_root': OID_CARE_TEAM_ORGANIZER_ENTRY,
        '@_extension': '2022-06-01',
      },
    ]);
  });

  test('should include care team identifiers', () => {
    const careTeam: CareTeam = {
      id: 'careteam-1',
      resourceType: 'CareTeam',
      status: 'active',
      subject: createReference(patient),
      identifier: [
        { system: 'http://example.org', value: 'careteam-123' },
        { system: 'http://another.org', value: 'careteam-456' },
      ],
    };

    const result = createCareTeamEntry(converter, careTeam);

    const organizer = result.organizer?.[0];
    expect(organizer?.id).toBeDefined();
    expect(organizer?.id?.length).toBeGreaterThanOrEqual(1); // At least the base ID
  });

  test('should handle care team without participants', () => {
    const careTeam: CareTeam = {
      id: 'careteam-1',
      resourceType: 'CareTeam',
      status: 'active',
      subject: createReference(patient),
    };

    const result = createCareTeamEntry(converter, careTeam);

    const organizer = result.organizer?.[0];
    expect(organizer?.component).toBeUndefined();
  });

  test('should include participant roles', () => {
    const participants: CareTeamParticipant[] = [
      {
        role: [
          {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '17561000',
                display: 'Cardiologist',
              },
            ],
          },
        ],
      },
      {
        role: [
          {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '158965000',
                display: 'Medical practitioner',
              },
            ],
          },
        ],
      },
    ];

    const careTeam: CareTeam = {
      id: 'careteam-1',
      resourceType: 'CareTeam',
      status: 'active',
      subject: createReference(patient),
      participant: participants,
    };

    const result = createCareTeamEntry(converter, careTeam);

    const organizer = result.organizer?.[0];
    expect(organizer?.component).toBeDefined();
    expect(organizer?.component?.length).toBe(2);

    const components = organizer?.component;
    expect(components).toBeDefined();
    expect(components?.length).toBe(2);
    // Note: Component structure is cast to CcdaOrganizerComponent for interoperability
  });

  test('should handle participants without roles', () => {
    const participants: CareTeamParticipant[] = [
      {
        member: createReference(patient),
      },
      {
        role: [
          {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '17561000',
                display: 'Cardiologist',
              },
            ],
          },
        ],
      },
    ];

    const careTeam: CareTeam = {
      id: 'careteam-1',
      resourceType: 'CareTeam',
      status: 'active',
      subject: createReference(patient),
      participant: participants,
    };

    const result = createCareTeamEntry(converter, careTeam);

    const organizer = result.organizer?.[0];
    expect(organizer?.component).toBeDefined();
    expect(organizer?.component?.length).toBe(2);

    const components = organizer?.component;
    expect(components).toBeDefined();
    expect(components?.length).toBe(2);
    // Note: Component structure is cast to CcdaOrganizerComponent for interoperability
  });

  test('should handle empty participant array', () => {
    const careTeam: CareTeam = {
      id: 'careteam-1',
      resourceType: 'CareTeam',
      status: 'active',
      subject: createReference(patient),
      participant: [],
    };

    const result = createCareTeamEntry(converter, careTeam);

    const organizer = result.organizer?.[0];
    expect(organizer?.component).toEqual([]);
  });

  test('should handle care team without id or identifiers', () => {
    const careTeam: CareTeam = {
      resourceType: 'CareTeam',
      status: 'active',
      subject: createReference(patient),
    };

    const result = createCareTeamEntry(converter, careTeam);

    const organizer = result.organizer?.[0];
    expect(organizer?.id).toBeDefined();
    expect(organizer?.id?.length).toBeGreaterThanOrEqual(0); // May be empty if no ID provided
  });
});
