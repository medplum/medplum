// start-block imports
import { MedicationRequest } from '@medplum/fhirtypes';

// end-block imports

const instructions: MedicationRequest =
  // start-block dispenseInstructions
  {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: {
      reference: 'Patient/homer-simpson',
    },
    medicationCodeableConcept: {
      coding: [
        {
          system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
          code: '1049221',
          display: 'acetaminophen 325 MG / oxycodone hydrochloride 5 MG Oral Tablet [Percocet]',
        },
      ],
    },
    requester: {
      reference: 'Practitioner/dr-alice-smith',
    },
    dispenseRequest: {
      initialFill: {
        quantity: {
          value: 30,
          unit: 'tablets',
        },
      },
      dispenseInterval: {
        value: 30,
        unit: 'days',
      },
      validityPeriod: {
        start: '2023-09-04',
        end: '2023-11-04',
      },
      numberOfRepeatsAllowed: 1,
      quantity: {
        value: 30,
        unit: 'tablets',
      },
      expectedSupplyDuration: {
        value: 30,
        unit: 'days',
      },
      performer: {
        reference: 'Organization/example-pharmacy',
      },
    },
  };
// end-block dispenseInstructions

const dosageInstruction: MedicationRequest =
  // start-block dosageInstructions
  {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: {
      reference: 'Patient/homer-simpson',
    },
    medicationCodeableConcept: {
      coding: [
        {
          system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
          code: '224917',
          display: 'Ritalin',
        },
      ],
    },
    dosageInstruction: [
      {
        sequence: 1,
        patientInstruction: 'Take one tablet orally with water, each morning',
        asNeededBoolean: false,
        route: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '26643006',
              display: 'Oral route',
            },
          ],
        },
        method: {
          coding: [
            {
              system: 'http://snomed.info.sct',
              code: '738995006',
              display: 'Swallow',
            },
          ],
        },
        doseAndRate: [
          {
            doseQuantity: {
              value: 1,
              unit: 'tablet',
            },
          },
        ],
        maxDosePerPeriod: {
          numerator: {
            value: 1,
            unit: 'tablet',
          },
          denominator: {
            value: 1,
            unit: 'day',
          },
        },
        maxDosePerAdministration: {
          value: 1,
          unit: 'tablet',
        },
      },
    ],
  };
// end-block dosageInstructions

const prescription: Partial<MedicationRequest> =
  // start-block prescriptionRequest
  {
    resourceType: 'MedicationRequest',
    // ...
    category: [
      {
        coding: [
          {
            system: 'https://www.hl7.org/fhir/valueset-medicationrequest-admin-location.html',
            code: 'outpatient',
          },
        ],
      },
    ],
  };
// end-block prescriptionRequest

const medicalOrder: Partial<MedicationRequest> =
  // start-block orderRequest
  {
    resourceType: 'MedicationRequest',
    // ...
    category: [
      {
        coding: [
          {
            system: 'https://www.hl7.org/fhir/valueset-medicationrequest-admin-location.html',
            code: 'inpatient',
          },
        ],
      },
    ],
  };
// end-block orderRequest

console.log(instructions, dosageInstruction, medicalOrder, prescription);
