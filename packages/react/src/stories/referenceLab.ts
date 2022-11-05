import { ObservationDefinition } from '@medplum/fhirtypes';

export const TestosteroneDefinition: ObservationDefinition = {
  resourceType: 'ObservationDefinition',
  category: [
    {
      coding: [
        {
          system: 'https://foomedical.com/observationCategory',
          code: 'Reproductive',
        },
      ],
    },
  ],
  method: {
    text: 'Fingerstick',
  },
  code: {
    coding: [
      {
        system: 'https://foomedical.com',
        code: 'TESTOSTERONE',
        display: 'Testosterone',
      },
    ],
    text: 'Testosterone',
  },
  permittedDataType: ['Quantity'],
  quantitativeDetails: {
    unit: {
      coding: [
        {
          code: 'ng/dL',
          display: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      ],
      text: 'ng/dL',
    },
    decimalPrecision: 1,
  },
  qualifiedInterval: [
    {
      condition: 'Normal',
      gender: 'male',
      range: {
        high: {
          value: 563,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 11,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 14,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'High',
      gender: 'male',
      range: {
        low: {
          value: 563.1,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 11,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 14,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Low',
      gender: 'male',
      range: {
        high: {
          value: 48.9,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 15,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 19,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Normal',
      gender: 'male',
      range: {
        low: {
          value: 49,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 769,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 15,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 19,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'High',
      gender: 'male',
      range: {
        low: {
          value: 769.1,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 15,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 19,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Low',
      gender: 'male',
      range: {
        high: {
          value: 248.9,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 20,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 49,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Normal',
      gender: 'male',
      range: {
        low: {
          value: 249,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 836,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 20,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 49,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'High',
      gender: 'male',
      range: {
        low: {
          value: 836.1,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 20,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 49,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Low',
      gender: 'male',
      range: {
        high: {
          value: 192.9,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 50,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Normal',
      gender: 'male',
      range: {
        low: {
          value: 193,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 740,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 50,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'High',
      gender: 'male',
      range: {
        low: {
          value: 740.1,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 50,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Normal',
      gender: 'female',
      range: {
        high: {
          value: 52,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 11,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 19,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'High',
      gender: 'female',
      range: {
        low: {
          value: 52.1,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 11,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 19,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Low',
      gender: 'female',
      range: {
        high: {
          value: 8.3,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 20,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 49,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Normal',
      gender: 'female',
      range: {
        low: {
          value: 8.4,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 48.1,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 20,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 49,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'High',
      gender: 'female',
      range: {
        low: {
          value: 48.2,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 20,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 49,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Low',
      gender: 'female',
      range: {
        high: {
          value: 2.8,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 50,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Normal',
      gender: 'female',
      range: {
        low: {
          value: 2.9,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 40.8,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 50,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'High',
      gender: 'female',
      range: {
        low: {
          value: 40.9,
          unit: 'ng/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
      age: {
        low: {
          value: 50,
          unit: 'years',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
  ],
  id: 'testosterone-definition',
};

export const HDLDefinition: ObservationDefinition = {
  resourceType: 'ObservationDefinition',
  category: [
    {
      coding: [
        {
          system: 'https://foomedical.com/observationCategory',
          code: 'Heart',
        },
      ],
    },
  ],
  method: {
    text: 'Fingerstick',
  },
  code: {
    coding: [
      {
        system: 'https://foomedical.com',
        code: 'HDL',
        display: 'HDL',
      },
    ],
    text: 'HDL',
  },
  permittedDataType: ['Quantity'],
  quantitativeDetails: {
    unit: {
      coding: [
        {
          code: 'mg/dL',
          display: 'mg/dL',
          system: 'http://unitsofmeasure.org',
        },
      ],
      text: 'mg/dL',
    },
    decimalPrecision: 0,
  },
  qualifiedInterval: [
    {
      condition: 'Major risk',
      range: {
        high: {
          value: 39,
          unit: 'mg/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Normal risk',
      range: {
        low: {
          value: 40,
          unit: 'mg/dL',
          system: 'http://unitsofmeasure.org',
        },
        high: {
          value: 60,
          unit: 'mg/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
    {
      condition: 'Negative risk',
      range: {
        low: {
          value: 61,
          unit: 'mg/dL',
          system: 'http://unitsofmeasure.org',
        },
      },
    },
  ],
};
