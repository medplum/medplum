import { Condition, Patient } from '@medplum/fhirtypes';
import { MedplumClient } from '@medplum/core';
const medplum = new MedplumClient();

const patientData: Patient =
  // start-block patient-example
  {
    resourceType: 'Patient',
    name: [
      {
        given: ['John'],
        family: 'Doe',
      },
    ],
    birthDate: '1980-05-15',
    gender: 'male',
  };
// end-block patient-example

await medplum.createResource(patientData);

const patientWithIdentifier: Patient =
  // start-block patient-with-identifier
  {
    resourceType: 'Patient',
    identifier: [
      // highlight-start
      {
        system: 'http://your-source-system.com/patientId',
        value: 'P001',
      },
      // highlight-end
    ],
    // ... other patient data
  };
// end-block patient-with-identifier

await medplum.createResource(patientWithIdentifier);

const conditionExample: Condition =
  // start-block condition-example
  {
    resourceType: 'Condition',
    identifier: [
      {
        system: 'http://your-source-system.com/patient_conditions',
        value: 'PC001',
      },
    ],
    subject: {
      reference: 'Patient/????',
    },
    code: {
      coding: [
        // highlight-start
        {
          system: 'http://your-source-system.com/conditions',
          code: 'HT001',
          display: 'Hypertension',
        },
        // highlight-end
      ],
      text: 'Hypertension',
    },
  };
// end-block condition-example

await medplum.createResource(conditionExample);

const enrichedConditionExample: Condition = {
  // start-block enriched-condition-example
  resourceType: 'Condition',
  identifier: [
    {
      system: 'http://your-source-system.com/patient_conditions',
      value: 'PC001',
    },
  ],
  subject: {
    reference: 'Patient?identifier=http://your-source-system.com/patients|P001',
  },
  code: {
    coding: [
      {
        system: 'http://your-source-system.com/conditions',
        code: 'HT001',
        display: 'Hypertension',
      },
      // highlight-start
      {
        system: 'http://hl7.org/fhir/sid/icd-10',
        code: 'I10',
        display: 'Essential (primary) hypertension',
      },
      // highlight-end
    ],
    text: 'Hypertension',
  },
  onsetDateTime: '2022-03-15',
  // end-block enriched-condition-example
};

await medplum.createResource(enrichedConditionExample);

// Conditional References
const conditionalReferenceExample: Condition =
  // start-block conditional-reference-example
  {
    resourceType: 'Condition',
    identifier: [
      {
        system: 'http://your-source-system.com/patient_conditions',
        value: 'PC001',
      },
    ],
    // highlight-start
    subject: {
      reference: 'Patient?identifier=http://your-source-system.com/patients|P001',
    },
    // highlight-end
    // ...
  };
// end-block conditional-reference-example

await medplum.createResource(conditionalReferenceExample);

// End to End Example
const johnDoePatient: Patient =
  // start-block john-doe-patient
  {
    resourceType: 'Patient',
    identifier: [
      {
        system: 'http://your-source-system.com/patients',
        value: 'P001',
      },
    ],
    name: [
      {
        given: ['John'],
        family: 'Doe',
      },
    ],
    birthDate: '1980-07-15',
    gender: 'male',
  };
// end-block john-doe-patient
await medplum.createResource(johnDoePatient);

const janeSmithPatient: Patient =
  // start-block jane-smith-patient
  {
    resourceType: 'Patient',
    identifier: [
      {
        system: 'http://your-source-system.com/patients',
        value: 'P002',
      },
    ],
    name: [
      {
        given: ['Jane'],
        family: 'Smith',
      },
    ],
    birthDate: '1992-11-30',
    gender: 'female',
  };
// end-block jane-smith-patient

await medplum.createResource(janeSmithPatient);

const johnDoeHypertension: Condition =
  // start-block john-doe-hypertension
  {
    resourceType: 'Condition',
    identifier: [
      {
        system: 'http://your-source-system.com/patient_conditions',
        value: 'PC001',
      },
    ],
    subject: {
      reference: 'Patient?identifier=http://your-source-system.com/patients|P001',
    },
    code: {
      coding: [
        {
          system: 'http://your-source-system.com/conditions',
          code: 'HT001',
          display: 'Hypertension',
        },
        {
          system: 'http://hl7.org/fhir/sid/icd-10',
          code: 'I10',
          display: 'Essential (primary) hypertension',
        },
      ],
      text: 'Hypertension',
    },
    onsetDateTime: '2022-03-15',
  };
// end-block john-doe-hypertension

await medplum.createResource(johnDoeHypertension);

const johnDoeDiabetes: Condition =
  // start-block john-doe-diabetes
  {
    resourceType: 'Condition',
    identifier: [
      {
        system: 'http://your-source-system.com/patient_conditions',
        value: 'PC002',
      },
    ],
    subject: {
      reference: 'Patient?identifier=http://your-source-system.com/patients|P001',
    },
    code: {
      coding: [
        {
          system: 'http://your-source-system.com/conditions',
          code: 'DM002',
          display: 'Diabetes',
        },
        {
          system: 'http://hl7.org/fhir/sid/icd-10',
          code: 'E11',
          display: 'Type 2 diabetes mellitus',
        },
      ],
      text: 'Diabetes',
    },
    onsetDateTime: '2023-01-10',
  };
// end-block john-doe-diabetes

await medplum.createResource(johnDoeDiabetes);

const janeSmithHypertension: Condition =
  // start-block jane-smith-hypertension
  {
    resourceType: 'Condition',
    identifier: [
      {
        system: 'http://your-source-system.com/patient_conditions',
        value: 'PC003',
      },
    ],
    subject: {
      reference: 'Patient?identifier=http://your-source-system.com/patients|P002',
    },
    code: {
      coding: [
        {
          system: 'http://your-source-system.com/conditions',
          code: 'HT001',
          display: 'Hypertension',
        },
        {
          system: 'http://hl7.org/fhir/sid/icd-10',
          code: 'I10',
          display: 'Essential (primary) hypertension',
        },
      ],
      text: 'Hypertension',
    },
    onsetDateTime: '2023-02-22',
  };
// end-block jane-smith-hypertension

await medplum.createResource(janeSmithHypertension);
