// start-block imports
import { LOINC, MedplumClient, SNOMED, UCUM } from '@medplum/core';
import { ActivityDefinition, ObservationDefinition, PlanDefinition, SpecimenDefinition } from '@medplum/fhirtypes';

// end-block imports

const medplum = new MedplumClient();

const sodiumLevel: ObservationDefinition =
  // start-block observationDefinitionSodium
  {
    resourceType: 'ObservationDefinition',
    id: 'observation-blood-sodium',
    code: {
      coding: [
        {
          system: LOINC,
          code: '2947-0',
          display: 'Sodium [Moles/volume] in Blood',
        },
      ],
    },
    preferredReportName: 'Sodium Level',
    quantitativeDetails: {
      unit: {
        coding: [
          {
            system: UCUM,
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

const potassiumLevel: ObservationDefinition =
  // start-block observationDefinitionPotassium
  {
    resourceType: 'ObservationDefinition',
    id: 'observation-blood-potassium',
    code: {
      coding: [
        {
          system: LOINC,
          code: '6298-4',
          display: 'Potassium [Moles/volume] in Blood',
        },
      ],
    },
    preferredReportName: 'Potassium Level',
    quantitativeDetails: {
      unit: {
        coding: [
          {
            system: UCUM,
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
            value: 3.5,
            unit: 'mmol/L',
          },
          high: {
            value: 5.1,
            unit: 'mmol/L',
          },
        },
      },
    ],
  };
// end-block observationDefinitionPotassium

const chlorideLevel: ObservationDefinition =
  // start-block observationDefinitionChloride
  {
    resourceType: 'ObservationDefinition',
    id: 'observation-blood-chloride',
    code: {
      coding: [
        {
          system: LOINC,
          code: '2069-3',
          display: 'Chloride [Moles/volume] in Blood',
        },
      ],
    },
    preferredReportName: 'Chloride Level',
    quantitativeDetails: {
      unit: {
        coding: [
          {
            system: UCUM,
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
            value: 96,
            unit: 'mmol/L',
          },
          high: {
            value: 106,
            unit: 'mmol/L',
          },
        },
      },
    ],
  };
// end-block observationDefinitionChloride

const carbonDioxideLevel: ObservationDefinition =
  // start-block observationDefinitionCarbonDioxide
  {
    resourceType: 'ObservationDefinition',
    id: 'observation-blood-carbon-dioxide',
    code: {
      coding: [
        {
          system: LOINC,
          code: '20565-8',
          display: 'Carbon dioxide, total [Moles/volume] in Blood',
        },
      ],
    },
    preferredReportName: 'Total CO2 Level',
    quantitativeDetails: {
      unit: {
        coding: [
          {
            system: UCUM,
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
            value: 22,
            unit: 'mmol/L',
          },
          high: {
            value: 29,
            unit: 'mmol/L',
          },
        },
      },
    ],
  };
// end-block observationDefinitionCarbonDioxide

const testosteroneFreeWeaklyBound: ObservationDefinition =
  // start-block observationDefinitionTestosterone
  {
    resourceType: 'ObservationDefinition',
    id: 'observation-serum-testosterone-free-weakly-bound',
    code: {
      coding: [
        {
          system: LOINC,
          code: '41018-3',
          display: 'Testosterone.free+weakly bound [Moles/volume] in Serum or Plasma',
        },
      ],
    },
    preferredReportName: 'Free Testosterone Level',
    quantitativeDetails: {
      unit: {
        coding: [
          {
            system: UCUM,
            code: 'nmol/L',
            display: 'nanomoles per liter',
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
            value: 10,
            unit: 'nmol/L',
          },
          high: {
            value: 30,
            unit: 'nmol/L',
          },
        },
      },
    ],
  };
// end-block observationDefinitionTestosterone

const estradiolE2: ObservationDefinition =
  // start-block observationDefinitionEstradiol
  {
    resourceType: 'ObservationDefinition',
    id: 'observation-serum-estradiol-e2',
    code: {
      coding: [
        {
          system: LOINC,
          code: '14715-7',
          display: 'Estradiol (E2) [Moles/volume] in Serum or Plasma',
        },
      ],
    },
    preferredReportName: 'Estradiol (E2) Level',
    quantitativeDetails: {
      unit: {
        coding: [
          {
            system: UCUM,
            code: 'pmol/L',
            display: 'picomoles per liter',
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
            value: 40,
            unit: 'pmol/L',
          },
          high: {
            value: 200,
            unit: 'pmol/L',
          },
        },
      },
    ],
  };
// end-block observationDefinitionEstradiol

console.log(sodiumLevel, potassiumLevel, carbonDioxideLevel, chlorideLevel, testosteroneFreeWeaklyBound, estradiolE2);

const fingerprickSpecimen: SpecimenDefinition =
  // start-block fingerprickSpecimen
  {
    resourceType: 'SpecimenDefinition',
    id: 'fingerprick-capillary-blood',
    // Specimen Material Type
    typeCollected: {
      coding: [
        {
          system: SNOMED,
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
            system: SNOMED,
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
        preference: 'preferred',
        container: {
          type: {
            coding: [
              {
                system: SNOMED,
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
              system: UCUM,
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
              system: UCUM,
              code: 'd',
            },
          },
        ],
      },
      // Second output is a green-capped tube
      {
        preference: 'preferred',
        container: {
          type: {
            coding: [
              {
                system: SNOMED,
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

const sodiumService: PlanDefinition =
  // start-block sodiumService
  {
    resourceType: 'PlanDefinition',
    id: 'example-lab-service-sodium-serum',
    url: 'http://example.org/PlanDefinition/lab-service-sodium-serum',
    status: 'active',
    identifier: [
      {
        use: 'official',
        value: 'Na_serum_test',
      },
    ],
    name: 'sodium-serum-measurement',
    title: 'Sodium measurement on in vitro blood serum',
    description: 'Sodium measurement on serum specimen',
    type: {
      coding: [
        {
          system: 'http://hl7.org/fhir/uv/order-catalog/CodeSystem/laboratory-service-definition-type',
          code: 'test',
          display: 'unitary measurement performed on an in vitro biologic specimen',
        },
      ],
    },
    action: [
      {
        code: [
          {
            coding: [
              {
                system: LOINC,
                code: '2947-0',
                display: 'Sodium [Moles/volume] in Blood',
              },
            ],
          },
        ],
        definitionCanonical: 'http://example.org/lab-procedure-sodium-serum',
      },
    ],
    useContext: [
      {
        code: {
          system: 'http://terminology.hl7.org/CodeSystem/usage-context-type',
          code: 'task',
        },
        valueCodeableConcept: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'LABOE',
              display: 'laboratory test order entry task',
            },
          ],
        },
      },
    ],
  };
// end-block sodiumService
console.log(sodiumService);

const electrolytesPanelService: PlanDefinition =
  // start-block electrolytesPanelService
  {
    resourceType: 'PlanDefinition',
    id: 'example-lab-service-electrolytes-panel-blood',
    status: 'active',
    // Canonical URL
    url: 'http://example.org/PlanDefinition/lab-service-electrolytes-panel-blood',
    // Business Identifier
    identifier: [
      {
        use: 'official',
        value: 'electrolytes_panel_test',
      },
    ],
    // Machine-friendly name
    name: 'electrolytes-panel-blood-measurement',
    // Human-friendly name
    title: 'Electrolytes panel measurement in blood',
    description: 'Electrolytes panel measurement on blood specimen',
    // 'test' or 'panel'
    type: {
      coding: [
        {
          system: 'http://hl7.org/fhir/uv/order-catalog/CodeSystem/laboratory-service-definition-type',
          code: 'panel',
          display: 'collection of tests and panels performed on one or more in vitro biologic specimens',
        },
      ],
    },
    // This service contains a single action since only one procedure is required for fulfillment
    action: [
      {
        code: [
          {
            coding: [
              {
                system: LOINC,
                code: '55231-5',
                display: 'Electrolytes panel - Blood',
              },
            ],
          },
        ],
        definitionCanonical: 'http://example.org/lab-procedure-electrolytes-panel-blood',
      },
    ],
    // 'LABOE' indicates that this PlanDefinition is represents a Lab service
    useContext: [
      {
        code: {
          system: 'http://terminology.hl7.org/CodeSystem/usage-context-type',
          code: 'task',
        },
        valueCodeableConcept: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'LABOE',
              display: 'laboratory test order entry task',
            },
          ],
        },
      },
    ],
  };
// end-block electrolytesPanelService
console.log(electrolytesPanelService);

const mensHealthService: PlanDefinition =
  // start-block mensHealthService
  {
    resourceType: 'PlanDefinition',
    id: 'example-lab-service-mens-health',
    status: 'active',
    // Canonical URL
    url: 'http://example.org/PlanDefinition/lab-service-mens-health',
    // Business Identifier
    identifier: [
      {
        use: 'official',
        value: 'mens_health_panel_test',
      },
    ],
    // Machine-friendly name
    name: 'mens-health-panel',
    // Human-friendly name
    title: "Men's Health Panel",
    description: "Men's health-related laboratory tests",
    // 'test' or 'panel'
    type: {
      coding: [
        {
          system: 'http://hl7.org/fhir/uv/order-catalog/CodeSystem/laboratory-service-definition-type',
          code: 'panel',
          display: 'collection of tests and panels performed on one or more in vitro biologic specimens',
        },
      ],
    },
    action: [
      {
        code: [
          {
            coding: [
              {
                system: LOINC,
                code: '41018-3',
                display: 'Testosterone.free+weakly bound [Moles/volume] in Serum or Plasma',
              },
            ],
          },
        ],
        definitionCanonical: 'http://example.org/lab-procedure-testosterone-serum',
      },
      {
        code: [
          {
            coding: [
              {
                system: LOINC,
                code: '55231-5',
                display: 'Electrolytes panel - Blood',
              },
            ],
          },
        ],
        definitionCanonical: 'http://example.org/lab-procedure-electrolytes-panel-blood',
      },
    ],
    useContext: [
      {
        code: {
          system: 'http://terminology.hl7.org/CodeSystem/usage-context-type',
          code: 'task',
        },
        valueCodeableConcept: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'LABOE',
              display: 'laboratory test order entry task',
            },
          ],
        },
      },
    ],
  };
// end-block mensHealthService
console.log(mensHealthService);

// start-block womensHealthService
const womensHealthService: PlanDefinition = {
  resourceType: 'PlanDefinition',
  status: 'active',
  id: 'example-lab-service-womens-health',
  // Canonical URL
  url: 'http://example.org/PlanDefinition/lab-service-womens-health',
  // Business Identifier
  identifier: [
    {
      use: 'official',
      value: 'womens_health_panel_test',
    },
  ],
  // Machine-friendly name
  name: 'womens-health-panel',
  // Human-friendly name
  title: "Women's Health Panel",
  description: "Women's health-related laboratory tests",
  // 'test' or 'panel'
  type: {
    coding: [
      {
        system: 'http://hl7.org/fhir/uv/order-catalog/CodeSystem/laboratory-service-definition-type',
        code: 'panel',
        display: 'collection of tests and panels performed on one or more in vitro biologic specimens',
      },
    ],
  },
  action: [
    {
      code: [
        {
          coding: [
            {
              system: LOINC,
              code: '14715-7',
              display: 'Estradiol (E2) [Moles/volume] in Serum or Plasma',
            },
          ],
        },
      ],
      definitionCanonical: 'http://example.org/lab-procedure-estradiol-e2-serum',
    },
    {
      code: [
        {
          coding: [
            {
              system: LOINC,
              code: '55231-5',
              display: 'Electrolytes panel - Blood',
            },
          ],
        },
      ],
      definitionCanonical: 'http://example.org/lab-procedure-electrolytes-panel-blood',
    },
  ],
  useContext: [
    {
      code: {
        system: 'http://terminology.hl7.org/CodeSystem/usage-context-type',
        code: 'task',
      },
      valueCodeableConcept: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'LABOE',
            display: 'laboratory test order entry task',
          },
        ],
      },
    },
  ],
};
// end-block womensHealthService
console.log(womensHealthService);

const sodiumProcedure: ActivityDefinition =
  // start-block sodiumProcedure
  {
    resourceType: 'ActivityDefinition',
    status: 'active',
    id: 'lab-procedure-sodium-serum',
    name: 'sodium-serum-measurement-procedure',
    title: 'Procedure - sodium measurement on in vitro blood serum',
    url: 'http://example.org/lab-procedure-sodium-serum',
    identifier: [
      {
        use: 'official',
        value: 'Na_serum_test',
      },
    ],
    code: {
      coding: [
        {
          system: LOINC,
          code: '2823-3',
          display: 'Sodium [Moles/volume] in Serum or Plasma',
        },
      ],
    },
    kind: 'ServiceRequest',
    observationResultRequirement: [
      {
        reference: 'ObservationDefinition/observation-serum-sodium',
      },
    ],
    specimenRequirement: [{ reference: 'SpecimenDefinition/fingerprick-capillary-blood' }],
  };
// end-block sodiumProcedure
console.log(sodiumProcedure);

const electrolytesPanelProcedure: ActivityDefinition =
  // start-block electrolytesPanel
  {
    resourceType: 'ActivityDefinition',
    id: 'lab-procedure-electrolytes-panel-blood',
    status: 'active',
    name: 'electrolytes-panel-blood-measurement-procedure',
    title: 'Procedure - Electrolytes panel measurement in blood',
    // Canonical URL
    url: 'http://example.org/lab-procedure-electrolytes-panel-blood',
    identifier: [
      {
        use: 'official',
        value: 'electrolytes_panel_test',
      },
    ],
    // LOINC Code
    code: {
      coding: [
        {
          system: LOINC,
          code: '55231-5',
          display: 'Electrolytes panel - Blood',
        },
      ],
    },
    kind: 'ServiceRequest',
    observationResultRequirement: [
      {
        reference: 'ObservationDefinition/observation-blood-potassium',
      },
      {
        reference: 'ObservationDefinition/observation-blood-chloride',
      },
      {
        reference: 'ObservationDefinition/observation-blood-carbon-dioxide',
      },
      {
        reference: 'ObservationDefinition/observation-blood-sodium',
      },
    ],
    specimenRequirement: [{ reference: 'SpecimenDefinition/fingerprick-capillary-blood' }],
  };
// end-block electrolytesPanel

console.log(electrolytesPanelProcedure);

const testosteroneFreeWeaklyBoundProcedure: ActivityDefinition =
  // start-block testosteroneProcedure
  {
    resourceType: 'ActivityDefinition',
    status: 'active',
    id: 'lab-procedure-testosterone-free-weakly-bound-serum',
    name: 'testosterone-free-weakly-bound-measurement-procedure',
    title: 'Procedure - Testosterone free & weakly bound measurement in in vitro serum',
    url: 'http://example.org/lab-procedure-testosterone-free-weakly-bound-serum',
    identifier: [
      {
        use: 'official',
        value: 'Testosterone_free_weakly_bound_test',
      },
    ],
    code: {
      coding: [
        {
          system: LOINC,
          code: '41018-3',
          display: 'Testosterone.free+weakly bound [Moles/volume] in Serum or Plasma',
        },
      ],
    },
    kind: 'ServiceRequest',
    observationResultRequirement: [
      {
        reference: 'ObservationDefinition/observation-serum-testosterone-free-weakly-bound',
      },
    ],
    specimenRequirement: [{ reference: 'SpecimenDefinition/fingerprick-capillary-blood' }],
  };
// end-block testosteroneProcedure
console.log(testosteroneFreeWeaklyBoundProcedure);

const estradiolE2Procedure: ActivityDefinition =
  // start-block estradiolProcedure
  {
    resourceType: 'ActivityDefinition',
    status: 'active',
    id: 'lab-procedure-estradiol-e2-serum',
    name: 'estradiol-e2-measurement-procedure',
    title: 'Procedure - Estradiol (E2) measurement in in vitro serum',
    url: 'http://example.org/lab-procedure-estradiol-e2-serum',
    identifier: [
      {
        use: 'official',
        value: 'Estradiol_E2_test',
      },
    ],
    code: {
      coding: [
        {
          system: LOINC,
          code: '14715-7',
          display: 'Estradiol (E2) [Moles/volume] in Serum or Plasma',
        },
      ],
    },
    kind: 'ServiceRequest',
    observationResultRequirement: [
      {
        reference: 'ObservationDefinition/observation-serum-estradiol-e2',
      },
    ],
    specimenRequirement: [{ reference: 'SpecimenDefinition/fingerprick-capillary-blood' }],
  };
// end-block estradiolProcedure

console.log(estradiolE2Procedure);

// start-block searchPdsTS
await medplum.searchResources('PlanDefinition', { context: 'LABOE' });
// end-block searchPdsTS

/*
// start-block searchPdsCLI
medplum get 'PlanDefinition?context=LABOE'
// end-block searchPdsCLI

// start-block searchPdsCurl
curl 'https://api.medplum.com/fhir/R4/PlanDefinition?context=LABOE' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchPdsCurl
*/

// start-block searchActivitiesTS
await medplum.search('PlanDefinition', { _id: '[serviceId]', _include: 'definition' });
// end-block searchActivitiesTS
/*
// start-block searchActivitiesCLI
medplum get 'PlanDefinition?_id=[serviceId]&_include=definition'
// end-block searchActivitiesCLI

// start-block searchActivitiesCurl
curl 'https://api.medplum.com/fhir/R4/PlanDefinition?_id=[serviceId]&_include=definition'' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json' \
// end-block searchActivitiesCurl
*/

/*
// start-block getODsandSDs
{
  ActivityDefinition(id: "[procedureId]") {
    resourceType
    url
    name
    code { coding { code } }
    title
    # Fetch Required Specimens
    specimenRequirement {
      resource {
        ... on SpecimenDefinition {
          # Extracted Material
          typeCollected {
            coding {
              code
            }
          }
          # Extraction Outputs
          typeTested {
            # Container Type
            container {
              cap {coding {code}}
            }
            # Handling Instructions
            handling {
              temperatureRange {
                low {value, unit},
                high {value, unit}
              }
            }
          }
        }
      }
    }
    # Fetch Output Observations
    observationResultRequirement {
      resource {
        ...on ObservationDefinition{
          preferredReportName
          code { coding {code} }
          # Precision and Units
          quantitativeDetails {
            unit {coding {code}}
            decimalPrecision
          }
          # Reference Ranges
          qualifiedInterval {
            condition
            age {
              low {value, unit}
              high {value, unit}
            }
            range {
              low {value unit}
              high {value unit}
            }
          }
        }
      }
    }
  }
}
// end-block getODsandSDs
*/

// start-block getODsandSDsTS
await medplum.graphql(`
{
  ActivityDefinition(id: "[procedureId]") {
    resourceType
    url
    name
    code { coding { code } }
    title
    # Fetch Required Specimens
    specimenRequirement {
      resource {
        ... on SpecimenDefinition {
          # Extracted Material
          typeCollected {
            coding {
              code
            }
          }
          # Extraction Outputs
          typeTested {
            # Container Type
            container {
              cap {coding {code}}
            }
            # Handling Instructions
            handling {
              temperatureRange {
                low {value, unit},
                high {value, unit}
              }
            }
          }
        }
      }
    }
    # Fetch Output Observations
    observationResultRequirement {
      resource {
        ...on ObservationDefinition{
          preferredReportName
          code { coding {code} }
          # Precision and Units
          quantitativeDetails {
            unit {coding {code}}
            decimalPrecision
          }
          # Reference Ranges
          qualifiedInterval {
            condition
            age {
              low {value, unit}
              high {value, unit}
            }
            range {
              low {value unit}
              high {value unit}
            }
          }
        }
      }
    }
  }
}`);
// end-block getODsandSDsTS
