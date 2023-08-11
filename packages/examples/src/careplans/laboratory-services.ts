// start-block imports
import { MedplumClient } from '@medplum/core';
import { ObservationDefinition, PlanDefinition, ActivityDefinition, SpecimenDefinition } from '@medplum/fhirtypes';

// end-block imports

// const medplum = new MedplumClient();

// start-block observationDefinitionSodium
const sodiumLevel: ObservationDefinition = {
  resourceType: 'ObservationDefinition',
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '2951-2',
        display: 'Sodium [Moles/volume] in Serum or Plasma',
      },
    ],
  },
  preferredReportName: 'Sodium Level',
  quantitativeDetails: {
    unit: {
      coding: [
        {
          system: 'http://unitsofmeasure.org',
          code: 'mmol/L',
          display: 'millimoles per liter',
        },
      ],
    },
    decimalPrecision: 2,
  },
  qualifiedInterval: [
    {
      condition: 'Normal',
      range: {
        low: {
          value: 135,
          unit: 'mmol/L',
        },
        high: {
          value: 145,
          unit: 'mmol/L',
        },
      },
    },
  ],
};
// end-block observationDefinitionSodium

console.log(sodiumLevel);

const fingerprickSpecimen: SpecimenDefinition =
  // start-block fingerprickSpecimen
  {
    resourceType: 'SpecimenDefinition',
    // Specimen Material Type
    typeCollected: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '122554006',
          display: 'Capillary Blood Specimen',
        },
      ],
    },
    // Collection Procedure
    collection: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '278450005',
            display: 'Finger-prick sampling',
          },
        ],
      },
    ],
    // Two "outputs" of the collection procedure
    typeTested: [
      // First output is a red-capped tube
      {
        container: {
          type: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '467989009',
                display: 'Capillary blood collection tube, no-additive',
              },
            ],
          },
          cap: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/container-cap',
                code: 'red',
              },
            ],
            text: 'red cap',
          },
        },
        // Storage durations for room temperature and frozen conditions
        handling: [
          {
            temperatureQualifier: {
              text: 'room temperature',
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/handling-condition',
                  code: 'room',
                  display: 'room temperature',
                },
              ],
            },
            maxDuration: {
              value: 7,
              unit: 'day',
              system: 'http://unitsofmeasure.org',
              code: 'd',
            },
          },
          {
            temperatureQualifier: {
              text: 'frozen',
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/handling-condition',
                  code: 'frozen',
                  display: 'frozen',
                },
              ],
            },
            maxDuration: {
              value: 28,
              unit: 'day',
              system: 'http://unitsofmeasure.org',
              code: 'd',
            },
          },
        ],
      },
      // Second output is a green-capped tube
      {
        container: {
          type: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '467989009',
                display: 'Capillary blood collection tube, no-additive',
              },
            ],
          },
          cap: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/container-cap',
                code: 'green',
              },
            ],
            text: 'green cap',
          },
        },
      },
    ],
  };
// end-block fingerprickSpecimen

console.log(fingerprickSpecimen);
