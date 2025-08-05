// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  getCodeBySystem,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import {
  Bot,
  Bundle,
  BundleEntry,
  List,
  ListEntry,
  MedicationKnowledge,
  Patient,
  Reference,
  SearchParameter,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { NEUTRON_HEALTH, NEUTRON_HEALTH_TREATMENTS } from './constants';
import { addPhotonIdToMedicationKnowledge, handler } from './sync-formulary';

describe('Sync formulary', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  vi.mock('./utils.ts', async () => {
    const actualModule = await vi.importActual('./utils.ts');
    return {
      ...actualModule,
      handlePhotonAuth: vi.fn().mockImplementation(() => 'example-auth-token'),
    };
  });

  const bot: Reference<Bot> = { reference: 'Bot/123' };
  const contentType = 'application/json';
  const baseList: List = {
    resourceType: 'List',
    status: 'current',
    mode: 'working',
  };
  const secrets = {
    PHOTON_CLIENT_ID: { name: 'Photon Client ID', valueString: 'client-id' },
    PHOTON_CLIENT_SECRET: { name: 'Photon Client Secret', valueString: 'client-secret' },
  };

  test.skip('No medications to sync', async () => {
    const medplum = new MockClient();

    await expect(() => handler(medplum, { bot, contentType, input: baseList, secrets })).rejects.toThrow(
      'No medications to sync'
    );
  });

  test.skip('No catalog in Photon', async () => {
    const medplum = new MockClient();
    const medicationKnowledge = await medplum.createResource(knowledge);

    const list: List = {
      ...baseList,
      entry: [{ item: { reference: getReferenceString(medicationKnowledge) } }],
    };

    await expect(() =>
      handler(medplum, {
        bot,
        contentType,
        input: list,
        secrets,
      })
    ).rejects.toThrow('No catalog found in Photon Health');
  }, 10000);

  test.skip('List includes resource that is not a MedicationKnowledge', async () => {
    const medplum = new MockClient();
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
    });
    const list: List = {
      ...baseList,
      entry: [{ item: { reference: getReferenceString(patient) } }],
    };

    await expect(() =>
      handler(medplum, {
        bot,
        contentType,
        input: list,
        secrets,
      })
    ).rejects.toThrow('Invalid resource type in formulary');
  });

  test.skip('All medications in formulary synced to photon', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch({
      resourceType: 'Bundle',
      type: 'transaction',
      entry: medicationKnowledgeBundleEntries,
    });

    const medicationKnowledges = await medplum.searchResources('MedicationKnowledge');
    const listEntry: ListEntry[] = medicationKnowledges.map((knowledge) => {
      return { item: { reference: getReferenceString(knowledge) } };
    });

    const list: List = await medplum.createResource({
      ...baseList,
      entry: listEntry,
    });

    const result = await handler(medplum, {
      bot,
      contentType,
      input: list,
      secrets,
    });

    expect(result.length).toBe(0);
  }, 20000);

  test.skip('Skip already synced medications', async () => {
    const medplum = new MockClient();
    await medplum.executeBatch({
      resourceType: 'Bundle',
      type: 'transaction',
      entry: medicationKnowledgeBundleEntries,
    });

    const medicationKnowledges = await medplum.searchResources('MedicationKnowledge');
    const listEntry: ListEntry[] = medicationKnowledges.map((knowledge) => {
      return {
        item: { reference: getReferenceString(knowledge) },
        flag: { coding: [{ system: NEUTRON_HEALTH, code: 'synced' }] },
      };
    });

    const list: List = await medplum.createResource({
      ...baseList,
      entry: listEntry,
    });

    await expect(() => handler(medplum, { bot, contentType, secrets, input: list })).rejects.toThrow(
      'No medications to sync'
    );
  });

  test.skip('Sync a medication that is not in Photon', async () => {
    const medplum = new MockClient();
    const medicationKnowledge = await medplum.createResource({
      resourceType: 'MedicationKnowledge',
      code: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '1546038',
            display: 'tetracycline hydrochloride 2.2 MG/ML Topical Solution',
          },
        ],
      },
    });

    const list: List = await medplum.createResource({
      ...baseList,
      entry: [{ item: { reference: getReferenceString(medicationKnowledge) } }],
    });

    const result = await handler(medplum, {
      bot,
      contentType,
      input: list,
      secrets,
    });

    expect(result.length).toBe(1);
  });

  test.skip('Formulary is updated on successful sync', async () => {
    const medplum = new MockClient();

    const medKnowledge: MedicationKnowledge = await medplum.createResource({
      resourceType: 'MedicationKnowledge',
      code: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '1869699',
            display: 'Linzess 72 MCG Oral Capsule',
          },
        ],
      },
    });

    const formulary: List = await medplum.createResource({
      ...baseList,
      entry: [{ item: { reference: getReferenceString(medKnowledge) } }],
    });

    const result = await handler(medplum, { bot, contentType, secrets, input: formulary });
    const updatedFormulary = await medplum.readResource('List', formulary.id as string);
    const medicationsUpdated = updatedFormulary.entry?.map((entry) => entry.flag);

    expect(medicationsUpdated?.length).toBe(1);
    expect(medicationsUpdated?.[0]?.coding?.[0]).toStrictEqual({ system: 'https://neutron.health', code: 'synced' });
    expect(result.length).toBe(0);
  }, 10000);

  test('Add photon ID to MedicationKnowledge', async () => {
    const medplum = new MockClient();
    const knowledge: MedicationKnowledge = await medplum.createResource({
      resourceType: 'MedicationKnowledge',
      code: { coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '310430' }] },
    });

    await addPhotonIdToMedicationKnowledge('example-id', knowledge, medplum);
    const updatedKnowledge = await medplum.searchOne('MedicationKnowledge');
    const codes = updatedKnowledge?.code;
    expect(codes).toBeDefined();
    expect(codes?.coding?.length).toBe(2);
    if (codes) {
      expect(getCodeBySystem(codes, NEUTRON_HEALTH_TREATMENTS)).toBe('example-id');
    }
  });
});

const medicationKnowledgeBundleEntries: BundleEntry[] = [
  {
    request: { method: 'POST', url: 'MedicationKnowledge' },
    resource: {
      resourceType: 'MedicationKnowledge',
      code: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '351993',
            display: 'GONAL-f 600 UNT/ML Injectable Solution',
          },
        ],
      },
    },
  },
  {
    request: { method: 'POST', url: 'MedicationKnowledge' },
    resource: {
      resourceType: 'MedicationKnowledge',
      code: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '1020118',
            display: 'triclosan 1.5 MG/ML Medicated Liquid Soap',
          },
        ],
      },
    },
  },
  {
    request: { method: 'POST', url: 'MedicationKnowledge' },
    resource: {
      resourceType: 'MedicationKnowledge',
      code: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '1869699',
            display: 'Linzess 72 MCG Oral Capsule',
          },
        ],
      },
    },
  },
];

const knowledge: MedicationKnowledge = {
  resourceType: 'MedicationKnowledge',
  status: 'active',
  code: {
    coding: [
      {
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        code: '861007',
        display: 'metFORMIN hydrochloride 500 MG Oral Tablet',
      },
    ],
  },
  manufacturer: {
    reference: 'Organization/acme-pharma',
    display: 'Acme Pharmaceuticals',
  },
  doseForm: { coding: [{ system: 'http://snomed.info/sct', code: '385055001', display: 'Tablet' }] },
  amount: {
    unit: 'tablets',
    value: 100,
    system: 'http://terminology.hl7.org/ValueSet/v3-UnitsOfMeasureCaseSensitive',
    code: '{tbl}',
  },
  synonym: ['metFORMIN'],
  ingredient: [
    {
      isActive: true,
      itemCodeableConcept: {
        coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '6809', display: 'metFORMIN' }],
      },
      strength: {
        numerator: {
          value: 500,
          unit: 'mg',
          system: 'http://unitofmeasure.com',
          code: 'mg',
        },
        denominator: {
          value: 1,
          unit: 'tablet',
          system: 'http://terminology.hl7.org/ValueSet/v3-UnitsOfMeasureCaseSensitive',
          code: '{tbl}',
        },
      },
    },
  ],
  packaging: {
    type: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/medicationknowledge-package-type',
          code: 'bot',
          display: 'Bottle',
        },
      ],
    },
    quantity: {
      value: 100,
      unit: 'tablets',
      system: 'http://terminology.hl7.org/ValueSet/v3-UnitsOfMeasureCaseSensitive',
      code: '{tbl}',
    },
  },
  intendedRoute: [
    {
      text: 'oral',
      coding: [
        {
          display: 'Oral use',
          code: '26643006',
          system: 'http://snomed.info/sct',
        },
      ],
    },
  ],
  drugCharacteristic: [
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/medicationknowledge-characteristic',
            code: 'color',
            display: 'Color',
          },
        ],
      },
      valueString: 'White',
    },
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/medicationknowledge-characteristic',
            code: 'shape',
            display: 'Shape',
          },
        ],
      },
      valueString: 'Oval',
    },
  ],
};
