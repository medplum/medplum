// start-block imports
import { MedplumClient, createReference, findObservationInterval } from '@medplum/core';
import { Observation, ObservationDefinition, Patient } from '@medplum/fhirtypes';

// end-block imports

const medplum = new MedplumClient();

let resource = await medplum.createResource<ObservationDefinition>(
  //start-block highRange
  {
    resourceType: 'ObservationDefinition',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '38483-4',
          display: 'Creatinine [Mass/volume] in Blood',
        },
      ],
    },
    qualifiedInterval: [
      {
        condition: 'Normal',
        range: {
          low: {
            value: 20,
            unit: 'mg/dL',
            system: 'http://unitsofmeasure.org',
          },
        },
      },
    ],
  }

  //end-block highRange
);

resource = await medplum.createResource<ObservationDefinition>(
  //start-block midRange
  {
    resourceType: 'ObservationDefinition',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '38483-4',
          display: 'Creatinine [Mass/volume] in Blood',
        },
      ],
    },
    qualifiedInterval: [
      {
        condition: 'Normal',
        range: {
          low: {
            value: 10,
            unit: 'mg/dL',
            system: 'http://unitsofmeasure.org',
          },
          high: {
            value: 100,
            unit: 'mg/dL',
            system: 'http://unitsofmeasure.org',
          },
        },
      },
    ],
  }
  //end-block midRange
);

resource = await medplum.createResource<ObservationDefinition>(
  //start-block lowRange
  {
    resourceType: 'ObservationDefinition',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '38483-4',
          display: 'Creatinine [Mass/volume] in Blood',
        },
      ],
    },
    qualifiedInterval: [
      {
        condition: 'Normal',
        range: {
          high: {
            value: 5,
            unit: 'mg/dL',
            system: 'http://unitsofmeasure.org',
          },
        },
      },
    ],
  }
  //end-block lowRange
);

resource = await medplum.createResource<ObservationDefinition>(
  //start-block allRanges
  {
    resourceType: 'ObservationDefinition',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '38483-4',
          display: 'Creatinine [Mass/volume] in Blood',
        },
      ],
    },
    qualifiedInterval: [
      {
        context: {
          text: 'Low',
        },
        range: {
          high: {
            value: 9,
            unit: 'mg/dL',
            system: 'http://unitsofmeasure.org',
            code: 'mg/dL',
          },
        },
      },
      {
        context: {
          text: 'Normal',
        },
        range: {
          low: {
            value: 10,
            unit: 'mg/dL',
            system: 'http://unitsofmeasure.org',
            code: 'mg/dL',
          },
          high: {
            value: 99,
            unit: 'mg/dL',
            system: 'http://unitsofmeasure.org',
            code: 'mg/dL',
          },
        },
      },
      {
        context: {
          text: 'High',
        },
        range: {
          low: {
            value: 100,
            unit: 'mg/dL',
            system: 'http://unitsofmeasure.org',
            code: 'mg/dL',
          },
        },
      },
    ],
  }
  //end-block allRanges
);

const testosteroneDefinition = await medplum.createResource<ObservationDefinition>(
  //start-block testosterone
  {
    resourceType: 'ObservationDefinition',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '2990-0',
          display: 'Testosterone.free+weakly bound [Mass/volume] in Serum or Plasma',
        },
      ],
      text: 'Testosterone',
    },
    qualifiedInterval: [
      {
        // highlight-start
        gender: 'male',
        age: {
          low: {
            value: 11,
            unit: 'years',
          },
          high: {
            value: 29,
            unit: 'years',
          },
        },
        // highlight-end
        condition: 'Normal',
        range: {
          low: {
            value: 200,
            unit: 'ng/dL',
          },
          high: {
            value: 900,
            unit: 'ng/dL',
          },
        },
      },
      {
        // highlight-start
        gender: 'male',
        age: {
          low: {
            value: 30,
            unit: 'years',
          },
        },
        // highlight-end
        condition: 'High',
        range: {
          low: {
            value: 300,
            unit: 'ng/dL',
          },
          high: {
            value: 1000,
            unit: 'ng/dL',
          },
        },
      },
      {
        // highlight-start
        gender: 'female',
        age: {
          low: {
            value: 11,
            unit: 'years',
          },
          high: {
            value: 14,
            unit: 'years',
          },
        },
        // highlight-end
        condition: 'Normal',
        range: {
          low: {
            value: 15,
            unit: 'ng/dL',
          },
          high: {
            value: 70,
            unit: 'ng/dL',
          },
        },
      },
      {
        // highlight-start
        gender: 'female',
        age: {
          low: {
            value: 15,
            unit: 'years',
          },
        },
        // highlight-end
        condition: 'High',
        range: {
          low: {
            value: 30,
            unit: 'ng/dL',
          },
          high: {
            value: 95,
            unit: 'ng/dL',
          },
        },
      },
    ],
  }
  //end-block testosterone
);

// start-block findInterval
const jane: Patient = {
  resourceType: 'Patient',
  name: [{ given: ['Jane'], family: 'Doe' }],
  gender: 'female',
  birthDate: '1970-01-01',
};

const janeTestosterone: Observation = {
  resourceType: 'Observation',
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '2990-0',
        display: 'Testosterone.free+weakly bound [Mass/volume] in Serum or Plasma',
      },
    ],
    text: 'Testosterone',
  },
  subject: createReference(jane),
  valueQuantity: {
    value: 32,
    unit: 'ng/dL',
  },
};

// highlight-next-line
findObservationInterval(testosteroneDefinition, jane, janeTestosterone.valueQuantity?.value as number);

// Returns
// {
//   gender: 'female',
//   age: {
//     low: {
//       value: 15,
//       unit: 'years',
//     },
//   },
//   condition: 'High',
//   range: {
//     low: {
//       value: 30,
//       unit: 'ng/dL',
//     },
//     high: {
//       value: 95,
//       unit: 'ng/dL',
//     },
//   },
// },

// end-block findInterval

resource = await medplum.createResource<ObservationDefinition>(
  // start-block categories
  {
    resourceType: 'ObservationDefinition',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '2093-3',
          display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
        },
      ],
      text: 'HDL Cholesterol',
    },
    qualifiedInterval: [
      // Reference ranges
      {
        // highlight-next-line
        category: 'reference',
        range: {
          low: {
            value: 21,
            unit: 'mg/dL',
          },
          high: {
            value: 39,
            unit: 'mg/dL',
          },
        },
        condition: 'Low',
      },
      {
        // highlight-next-line
        category: 'reference',
        range: {
          low: {
            value: 40,
            unit: 'mg/dL',
          },
          high: {
            value: 60,
            unit: 'mg/dL',
          },
        },
        condition: 'Normal',
      },

      {
        // highlight-next-line
        category: 'reference',
        range: {
          low: {
            value: 61,
            unit: 'mg/dL',
          },
          high: {
            value: 99,
            unit: 'mg/dL',
          },
        },
        condition: 'High',
      },
      // Critical Ranges
      {
        // highlight-next-line
        category: 'critical',
        range: {
          high: {
            value: 20,
            unit: 'mg/dL',
          },
        },
        condition: 'Critical Low',
      },
      {
        // highlight-next-line
        category: 'critical',
        range: {
          low: {
            value: 100,
            unit: 'mg/dL',
          },
        },
        condition: 'Critical High',
      },
      // Absolute Range
      {
        // highlight-next-line
        category: 'absolute',
        range: {
          low: {
            value: 0,
            unit: 'mg/dL',
          },
          high: {
            value: 120,
            unit: 'mg/dL',
          },
        },
        condition: 'Absolute Range',
      },
    ],
  }
  // end-block categories
);

console.log(resource);
