import { Bundle, Patient } from '@medplum/fhirtypes';

// First bundle to create patients
export const PATIENTS_BUNDLE: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    // Patient A
    {
      request: {
        method: 'POST',
        url: 'Patient',
      },
      resource: {
        resourceType: 'Patient',
        name: [{ family: 'A', given: ['Patient'], use: 'official' }],
        gender: 'female',
        birthDate: '1980-07-15',
      },
    },
    // Patient B
    {
      request: {
        method: 'POST',
        url: 'Patient',
      },
      resource: {
        resourceType: 'Patient',
        name: [{ family: 'B', given: ['Patient'], use: 'official' }],
        gender: 'male',
        birthDate: '1975-03-22',
      },
    },
    // Patient C
    {
      request: {
        method: 'POST',
        url: 'Patient',
      },
      resource: {
        resourceType: 'Patient',
        name: [{ family: 'C', given: ['Patient'], use: 'official' }],
        gender: 'male',
        birthDate: '1990-11-05',
      },
    },
  ],
};

// Function to create a bundle with resources referencing the created patients
export function createResourcesBundle(patients: Patient[]): Bundle {
  // Extract patient IDs
  const patientA = patients[0];
  const patientB = patients[1];
  const patientC = patients[2];

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      // Observation A
      {
        request: {
          method: 'POST',
          url: 'Observation',
        },
        resource: {
          resourceType: 'Observation',
          status: 'final',
          code: {
            text: 'Observation about Patient A',
          },
          subject: { reference: `Patient/${patientA.id}` },
          valueString: 'Normal findings for Patient A',
        },
      },
      // Observation B
      {
        request: {
          method: 'POST',
          url: 'Observation',
        },
        resource: {
          resourceType: 'Observation',
          status: 'final',
          code: {
            text: 'Observation about Patient B',
          },
          subject: { reference: `Patient/${patientB.id}` },
          valueString: 'Normal findings for Patient B',
        },
      },
      // Observation C
      {
        request: {
          method: 'POST',
          url: 'Observation',
        },
        resource: {
          resourceType: 'Observation',
          status: 'final',
          code: {
            text: 'Observation about Patient C',
          },
          subject: { reference: `Patient/${patientC.id}` },
          valueString: 'Normal findings for Patient C',
        },
      },
      // Diagnostic Report A
      {
        request: {
          method: 'POST',
          url: 'DiagnosticReport',
        },
        resource: {
          resourceType: 'DiagnosticReport',
          status: 'final',
          code: {
            text: 'Diagnostic Report for Patient A',
          },
          subject: { reference: `Patient/${patientA.id}` },
          conclusion: 'All tests normal for Patient A',
        },
      },
      // Diagnostic Report B
      {
        request: {
          method: 'POST',
          url: 'DiagnosticReport',
        },
        resource: {
          resourceType: 'DiagnosticReport',
          status: 'final',
          code: {
            text: 'Diagnostic Report for Patient B',
          },
          subject: { reference: `Patient/${patientB.id}` },
          conclusion: 'All tests normal for Patient B',
        },
      },
      // Diagnostic Report C
      {
        request: {
          method: 'POST',
          url: 'DiagnosticReport',
        },
        resource: {
          resourceType: 'DiagnosticReport',
          status: 'final',
          code: {
            text: 'Diagnostic Report for Patient C',
          },
          subject: { reference: `Patient/${patientC.id}` },
          conclusion: 'All tests normal for Patient C',
        },
      },
      // Encounter A
      {
        request: {
          method: 'POST',
          url: 'Encounter',
        },
        resource: {
          resourceType: 'Encounter',
          status: 'finished',
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'AMB',
            display: 'ambulatory',
          },
          subject: { reference: `Patient/${patientA.id}` },
          reasonCode: [{ text: 'Encounter for Patient A' }],
        },
      },
      // Encounter B
      {
        request: {
          method: 'POST',
          url: 'Encounter',
        },
        resource: {
          resourceType: 'Encounter',
          status: 'finished',
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'AMB',
            display: 'ambulatory',
          },
          subject: { reference: `Patient/${patientB.id}` },
          reasonCode: [{ text: 'Encounter for Patient B' }],
        },
      },
      // Encounter C
      {
        request: {
          method: 'POST',
          url: 'Encounter',
        },
        resource: {
          resourceType: 'Encounter',
          status: 'finished',
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'AMB',
            display: 'ambulatory',
          },
          subject: { reference: `Patient/${patientC.id}` },
          reasonCode: [{ text: 'Encounter for Patient C' }],
        },
      },
      // Communication A
      {
        request: {
          method: 'POST',
          url: 'Communication',
        },
        resource: {
          resourceType: 'Communication',
          status: 'completed',
          subject: { reference: `Patient/${patientA.id}` },
          payload: [{ contentString: 'Communication for Patient A' }],
        },
      },
      // Communication B
      {
        request: {
          method: 'POST',
          url: 'Communication',
        },
        resource: {
          resourceType: 'Communication',
          status: 'completed',
          subject: { reference: `Patient/${patientB.id}` },
          payload: [{ contentString: 'Communication for Patient B' }],
        },
      },
      // Communication C
      {
        request: {
          method: 'POST',
          url: 'Communication',
        },
        resource: {
          resourceType: 'Communication',
          status: 'completed',
          subject: { reference: `Patient/${patientC.id}` },
          payload: [{ contentString: 'Communication for Patient C' }],
        },
      },
    ],
  };
}
