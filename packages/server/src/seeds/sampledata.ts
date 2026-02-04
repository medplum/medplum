// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, LOINC, Operator, SNOMED, UCUM } from '@medplum/core';
import type {
  AccessPolicy,
  AllergyIntolerance,
  CarePlan,
  Condition,
  DiagnosticReport,
  Encounter,
  FamilyMemberHistory,
  Goal,
  ImagingStudy,
  Immunization,
  Location,
  MedicationRequest,
  MedicationStatement,
  Observation,
  Organization,
  Patient,
  Practitioner,
  Procedure,
  Project,
  ServiceRequest,
  User,
} from '@medplum/fhirtypes';
import { bcryptHashPassword, createProjectMembership } from '../auth/utils';
import type { Repository } from '../fhir/repo';
import { generatePatients, generatePractitioners } from './patient-data';

const MEDICAL_CONDITIONS = [
  { code: '38341003', display: 'Hypertensive disorder', text: 'Hypertensive disorder' },
  { code: '73211009', display: 'Diabetes mellitus type 2', text: 'Diabetes mellitus type 2' },
  { code: '44054006', display: 'Diabetes mellitus type 1', text: 'Diabetes mellitus type 1' },
  { code: '13645005', display: 'Chronic obstructive lung disease', text: 'Chronic obstructive lung disease' },
  { code: '49601007', display: 'Asthma', text: 'Asthma' },
  { code: '414915002', display: 'Ischemic heart disease', text: 'Ischemic heart disease' },
  { code: '44054006', display: 'Osteoarthritis', text: 'Osteoarthritis' },
];

const MEDICATIONS = [
  { text: 'Amoxicillin 500mg', code: '197806', display: 'Amoxicillin' },
  { text: 'Metformin 500mg', code: '6809', display: 'Metformin' },
  { text: 'Aspirin 100mg', code: '1191', display: 'Aspirin' },
  { text: 'Lisinopril 10mg', code: '314076', display: 'Lisinopril' },
  { text: 'Atorvastatin 20mg', code: '83367', display: 'Atorvastatin' },
  { text: 'Omeprazole 20mg', code: '7646', display: 'Omeprazole' },
];

const ALLERGIES = [
  { text: 'Penicillin', code: '7980', display: 'Penicillin' },
  { text: 'Aspirin', code: '1191', display: 'Aspirin' },
  { text: 'Lactose', code: '762952008', display: 'Lactose' },
  { text: 'Pollen', code: '762952008', display: 'Pollen' },
];

const IMMUNIZATIONS = [
  { text: 'COVID-19 vaccine', code: '1119349007', display: 'COVID-19 vaccine' },
  { text: 'Influenza', code: '140', display: 'Influenza' },
  { text: 'Hepatitis B', code: '45', display: 'Hepatitis B' },
  { text: 'MMR', code: '03', display: 'MMR' },
];

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 1): number {
  return Math.round((Math.random() * (max - min) + min) * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function randomDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(randomInt(8, 17), randomInt(0, 59), 0, 0);
  return date.toISOString();
}

function createWeightObservation(patient: Patient, encounter: Encounter, date: Date): Observation {
  const weight = randomFloat(50, 120, 1);
  return {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    encounter: createReference(encounter),
    effectiveDateTime: date.toISOString(),
    code: {
      coding: [
        {
          system: LOINC,
          code: '29463-7',
          display: 'Body Weight',
        },
      ],
      text: 'Body Weight',
    },
    valueQuantity: {
      value: weight,
      unit: 'kg',
      system: UCUM,
      code: 'kg',
    },
  };
}

function createHeightObservation(patient: Patient, encounter: Encounter, date: Date): Observation {
  const height = randomFloat(150, 200, 1);
  return {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    encounter: createReference(encounter),
    effectiveDateTime: date.toISOString(),
    code: {
      coding: [
        {
          system: LOINC,
          code: '8302-2',
          display: 'Body Height',
        },
      ],
      text: 'Body Height',
    },
    valueQuantity: {
      value: height,
      unit: 'cm',
      system: UCUM,
      code: 'cm',
    },
  };
}

function createHeartRateObservation(patient: Patient, encounter: Encounter, date: Date): Observation {
  const heartRate = randomInt(60, 100);
  return {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    encounter: createReference(encounter),
    effectiveDateTime: date.toISOString(),
    code: {
      coding: [
        {
          system: LOINC,
          code: '8867-4',
          display: 'Heart rate',
        },
      ],
      text: 'Heart rate',
    },
    valueQuantity: {
      value: heartRate,
      unit: '/min',
      system: UCUM,
      code: '/min',
    },
  };
}

function createRespiratoryRateObservation(patient: Patient, encounter: Encounter, date: Date): Observation {
  const respiratoryRate = randomInt(12, 20);
  return {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    encounter: createReference(encounter),
    effectiveDateTime: date.toISOString(),
    code: {
      coding: [
        {
          system: LOINC,
          code: '9279-1',
          display: 'Respiratory rate',
        },
      ],
      text: 'Respiratory rate',
    },
    valueQuantity: {
      value: respiratoryRate,
      unit: '/min',
      system: UCUM,
      code: '/min',
    },
  };
}

function createGlucoseObservation(patient: Patient, encounter: Encounter, date: Date): Observation {
  const glucose = randomFloat(4, 7, 1);
  return {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    encounter: createReference(encounter),
    effectiveDateTime: date.toISOString(),
    code: {
      coding: [
        {
          system: LOINC,
          code: '2339-0',
          display: 'Glucose',
        },
      ],
      text: 'Glucose',
    },
    valueQuantity: {
      value: glucose,
      unit: 'mmol/L',
      system: UCUM,
      code: 'mmol/L',
    },
  };
}

function createCondition(patient: Patient, practitioner: Practitioner): Condition {
  const condition = randomElement(MEDICAL_CONDITIONS);
  const onsetDate = randomDate(randomInt(30, 365));
  return {
    resourceType: 'Condition',
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: Math.random() > 0.3 ? 'active' : 'resolved',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
          code: 'confirmed',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
            code: 'encounter-diagnosis',
            display: 'Encounter Diagnosis',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: SNOMED,
          code: condition.code,
          display: condition.display,
        },
      ],
      text: condition.text,
    },
    subject: createReference(patient),
    recorder: createReference(practitioner),
    onsetDateTime: onsetDate,
    recordedDate: onsetDate,
  };
}

function createMedicationRequest(patient: Patient, practitioner: Practitioner): MedicationRequest {
  const medication = randomElement(MEDICATIONS);
  return {
    resourceType: 'MedicationRequest',
    status: Math.random() > 0.2 ? 'active' : 'completed',
    intent: 'order',
    priority: 'routine',
    subject: createReference(patient),
    requester: createReference(practitioner),
    dosageInstruction: [
      {
        text: 'Take as prescribed',
        sequence: 1,
        timing: {
          repeat: {
            frequency: randomInt(1, 3),
            period: 1,
            periodUnit: 'd',
          },
        },
      },
    ],
    authoredOn: randomDate(randomInt(1, 90)),
    medicationCodeableConcept: {
      text: medication.text,
      coding: [
        {
          system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
          code: medication.code,
          display: medication.display,
        },
      ],
    },
  };
}

function createMedicationStatement(patient: Patient): MedicationStatement {
  const medication = randomElement(MEDICATIONS);
  return {
    resourceType: 'MedicationStatement',
    status: 'active',
    subject: createReference(patient),
    medicationCodeableConcept: {
      text: medication.text,
      coding: [
        {
          system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
          code: medication.code,
          display: medication.display,
        },
      ],
    },
    effectivePeriod: {
      start: randomDate(randomInt(30, 180)),
    },
  };
}

function createAllergyIntolerance(patient: Patient, practitioner: Practitioner): AllergyIntolerance | null {
  if (Math.random() > 0.4) {
    return null;
  }
  const allergy = randomElement(ALLERGIES);
  return {
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
          code: 'confirmed',
          display: 'Confirmed',
        },
      ],
    },
    type: 'allergy',
    category: ['medication'],
    criticality: Math.random() > 0.7 ? 'high' : 'low',
    patient: createReference(patient),
    recorder: createReference(practitioner),
    code: {
      text: allergy.text,
      coding: [
        {
          system: SNOMED,
          code: allergy.code,
          display: allergy.display,
        },
      ],
    },
  };
}

function createImmunization(patient: Patient, practitioner: Practitioner): Immunization | null {
  if (Math.random() > 0.5) {
    return null;
  }
  const immunization = randomElement(IMMUNIZATIONS);
  return {
    resourceType: 'Immunization',
    status: 'completed',
    vaccineCode: {
      text: immunization.text,
      coding: [
        {
          system: 'http://hl7.org/fhir/sid/cvx',
          code: immunization.code,
          display: immunization.display,
        },
      ],
    },
    patient: createReference(patient),
    performer: [
      {
        actor: createReference(practitioner),
      },
    ],
    occurrenceDateTime: randomDate(randomInt(30, 730)),
  };
}

function createDiagnosticReport(patient: Patient, encounter: Encounter, practitioner: Practitioner): DiagnosticReport {
  return {
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: {
      coding: [
        {
          system: LOINC,
          code: '24323-8',
          display: 'Comprehensive metabolic panel',
        },
      ],
      text: 'Comprehensive metabolic panel',
    },
    subject: createReference(patient),
    encounter: createReference(encounter),
    performer: [createReference(practitioner)],
    effectiveDateTime: randomDate(randomInt(1, 30)),
    conclusion: 'Results within normal limits',
  };
}

function createCarePlan(patient: Patient, practitioner: Practitioner): CarePlan | null {
  if (Math.random() > 0.6) {
    return null;
  }
  return {
    resourceType: 'CarePlan',
    status: Math.random() > 0.3 ? 'active' : 'completed',
    intent: 'plan',
    subject: createReference(patient),
    created: randomDate(randomInt(1, 180)),
    author: createReference(practitioner),
    activity: [
      {
        detail: {
          kind: 'ServiceRequest',
          code: {
            text: 'Regular checkups',
          },
          status: 'scheduled',
        },
      },
    ],
  };
}

function createServiceRequest(patient: Patient, practitioner: Practitioner, encounter: Encounter): ServiceRequest | null {
  if (Math.random() > 0.7) {
    return null;
  }
  return {
    resourceType: 'ServiceRequest',
    status: Math.random() > 0.3 ? 'active' : 'completed',
    intent: 'order',
    priority: 'routine',
    subject: createReference(patient),
    encounter: createReference(encounter),
    requester: createReference(practitioner),
    code: {
      text: 'Laboratory tests',
      coding: [
        {
          system: SNOMED,
          code: '108252007',
          display: 'Laboratory procedure',
        },
      ],
    },
    authoredOn: randomDate(randomInt(1, 30)),
  };
}

function createProcedure(patient: Patient, practitioner: Practitioner, encounter: Encounter): Procedure | null {
  if (Math.random() > 0.6) {
    return null;
  }
  const procedures = [
    { code: '387713003', display: 'Surgical procedure', text: 'Surgical procedure' },
    { code: '103483005', display: 'Diagnostic procedure', text: 'Diagnostic procedure' },
    { code: '410606002', display: 'Therapeutic procedure', text: 'Therapeutic procedure' },
    { code: '225746001', display: 'Suture removal', text: 'Suture removal' },
    { code: '17219003', display: 'Biopsy', text: 'Biopsy' },
  ];
  const procedure = randomElement(procedures);
  return {
    resourceType: 'Procedure',
    status: Math.random() > 0.2 ? 'completed' : 'in-progress',
    code: {
      coding: [
        {
          system: SNOMED,
          code: procedure.code,
          display: procedure.display,
        },
      ],
      text: procedure.text,
    },
    subject: createReference(patient),
    encounter: createReference(encounter),
    performedDateTime: randomDate(randomInt(1, 90)),
    performer: [
      {
        actor: createReference(practitioner),
      },
    ],
  };
}

function createGoal(patient: Patient, _practitioner: Practitioner): Goal | null {
  if (Math.random() > 0.5) {
    return null;
  }
  const goals = [
    { text: 'Maintain blood pressure below 140/90' },
    { text: 'Achieve HbA1c level below 7%' },
    { text: 'Lose 10 pounds in 3 months' },
    { text: 'Exercise 30 minutes daily' },
    { text: 'Reduce cholesterol levels' },
  ];
  const goal = randomElement(goals);
  return {
    resourceType: 'Goal',
    lifecycleStatus: Math.random() > 0.3 ? 'active' : 'completed',
    description: {
      text: goal.text,
    },
    subject: createReference(patient),
    target: [
      {
        measure: {
          coding: [
            {
              system: LOINC,
              code: '8480-6',
              display: 'Systolic Blood Pressure',
            },
          ],
        },
        detailQuantity: {
          value: randomInt(120, 140),
          unit: 'mm[Hg]',
          system: UCUM,
          code: 'mm[Hg]',
        },
        dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
    ],
    expressedBy: createReference(patient),
    startDate: randomDate(randomInt(1, 180)).split('T')[0],
  };
}

function createImagingStudy(patient: Patient, practitioner: Practitioner, encounter: Encounter): ImagingStudy | null {
  if (Math.random() > 0.6) {
    return null;
  }
  const modalities = [
    { code: 'CT', display: 'CT Scan' },
    { code: 'MR', display: 'MRI' },
    { code: 'US', display: 'Ultrasound' },
    { code: 'XR', display: 'X-Ray' },
  ];
  const modality = randomElement(modalities);
  return {
    resourceType: 'ImagingStudy',
    status: 'available',
    modality: [
      {
        system: 'http://dicom.nema.org/resources/ontology/DCM',
        code: modality.code,
        display: modality.display,
      },
    ],
    subject: createReference(patient),
    encounter: createReference(encounter),
    started: randomDate(randomInt(1, 60)),
    numberOfSeries: randomInt(1, 5),
    numberOfInstances: randomInt(10, 100),
    procedureCode: [
      {
        coding: [
          {
            system: SNOMED,
            code: '363679005',
            display: 'Imaging procedure',
          },
        ],
      },
    ],
  };
}

function createFamilyMemberHistory(patient: Patient): FamilyMemberHistory | null {
  if (Math.random() > 0.5) {
    return null;
  }
  const conditions = [
    { code: '38341003', display: 'Hypertension' },
    { code: '73211009', display: 'Diabetes' },
    { code: '414915002', display: 'Heart disease' },
    { code: '363418001', display: 'Cancer' },
  ];
  const condition = randomElement(conditions);
  const relationships = ['father', 'mother', 'sibling', 'grandfather', 'grandmother'];
  return {
    resourceType: 'FamilyMemberHistory',
    status: 'completed',
    patient: createReference(patient),
    relationship: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
          code: randomElement(relationships),
        },
      ],
    },
    condition: [
      {
        code: {
          coding: [
            {
              system: SNOMED,
              code: condition.code,
              display: condition.display,
            },
          ],
        },
      },
    ],
  };
}

function createOrganization(): Organization {
  const orgNames = [
    'General Hospital',
    'Community Health Center',
    'Medical Clinic',
    'Family Practice',
    'Regional Hospital',
  ];
  const orgName = randomElement(orgNames);
  return {
    resourceType: 'Organization',
    name: orgName,
    address: [
      {
        line: [`${randomInt(100, 9999)} Main St`],
        city: randomElement(['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix']),
        state: randomElement(['NY', 'CA', 'IL', 'TX', 'AZ']),
        postalCode: randomInt(10001, 99999).toString(),
        country: 'US',
      },
    ],
    telecom: [
      {
        system: 'phone',
        value: `+1${randomInt(200, 999)}${randomInt(200, 999)}${randomInt(1000, 9999)}`,
      },
    ],
  };
}

function createLocation(organization: Organization): Location {
  const locationTypes = [
    { code: 'HOSP', display: 'Hospital' },
    { code: 'CLINIC', display: 'Clinic' },
    { code: 'ER', display: 'Emergency Room' },
    { code: 'OP', display: 'Outpatient' },
  ];
  const locationType = randomElement(locationTypes);
  return {
    resourceType: 'Location',
    status: 'active',
    name: `${locationType.display} - ${randomInt(1, 10)}`,
    type: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
            code: locationType.code,
            display: locationType.display,
          },
        ],
      },
    ],
    managingOrganization: createReference(organization),
    address: organization.address?.[0],
  };
}

export async function seedSampleData(systemRepo: Repository): Promise<void> {
  const patientCount = 80;
  const practitionerCount = 15;
  const DEFAULT_PATIENT_PASSWORD = 'Patient123!';

  const patientDataList = generatePatients(patientCount);
  const practitionerDataList = generatePractitioners(practitionerCount);

  // Get or create project - use project ID from environment variable or fallback to default
  // This allows seeds to work with existing production projects
  const projectId = process.env.MEDPLUM_PROJECT_ID || '9602358d-eeb0-4de8-bccf-e2438b5c9162';
  let project: Project;
  try {
    project = await systemRepo.readResource<Project>('Project', projectId);
  } catch {
    // If project doesn't exist, create it (only for default project ID)
    // Use assignedId option to create Project with specific ID
    if (projectId === '9602358d-eeb0-4de8-bccf-e2438b5c9162') {
      project = await systemRepo.createResource<Project>(
        {
          resourceType: 'Project',
          id: projectId,
          name: 'Foo Medical Project',
        },
        { assignedId: true }
      );
    } else {
      throw new Error(`Project ${projectId} not found. Please create it first or set MEDPLUM_PROJECT_ID to an existing project ID.`);
    }
  }

  // Create or update default patient access policy
  let patientAccessPolicy: AccessPolicy;
  const existingPolicy = project.defaultPatientAccessPolicy;
  if (existingPolicy) {
    patientAccessPolicy = await systemRepo.readReference(existingPolicy);

    patientAccessPolicy = await systemRepo.updateResource<AccessPolicy>({
      ...patientAccessPolicy,
      resource: [
        {
          resourceType: 'Patient',
          criteria: 'Patient?_id=%patient.id',
        },
        {
          resourceType: 'Observation',
          criteria: 'Observation?subject=%patient',
        },
        {
          resourceType: 'Condition',
          criteria: 'Condition?subject=%patient',
        },
        {
          resourceType: 'MedicationRequest',
          criteria: 'MedicationRequest?subject=%patient',
        },
        {
          resourceType: 'MedicationStatement',
          criteria: 'MedicationStatement?subject=%patient',
        },
        {
          resourceType: 'AllergyIntolerance',
          criteria: 'AllergyIntolerance?patient=%patient',
        },
        {
          resourceType: 'Immunization',
          criteria: 'Immunization?patient=%patient',
        },
        {
          resourceType: 'DiagnosticReport',
          criteria: 'DiagnosticReport?subject=%patient',
        },
        {
          resourceType: 'Encounter',
          criteria: 'Encounter?subject=%patient',
        },
        {
          resourceType: 'Procedure',
          criteria: 'Procedure?subject=%patient',
        },
        {
          resourceType: 'Goal',
          criteria: 'Goal?subject=%patient',
        },
        {
          resourceType: 'ImagingStudy',
          criteria: 'ImagingStudy?subject=%patient',
        },
        {
          resourceType: 'FamilyMemberHistory',
          criteria: 'FamilyMemberHistory?patient=%patient',
        },
        {
          resourceType: 'CarePlan',
          criteria: 'CarePlan?subject=%patient',
        },
        {
          resourceType: 'ServiceRequest',
          criteria: 'ServiceRequest?subject=%patient',
        },
        {
          resourceType: 'QuestionnaireResponse',
          criteria: 'QuestionnaireResponse?_compartment=%patient',
        },
        {
          resourceType: 'Questionnaire',
          readonly: true,
        },
        {
          resourceType: 'Communication',
          criteria: 'Communication?subject=%patient',
        },
        {
          resourceType: 'DocumentReference',
          criteria: 'DocumentReference?subject=%patient',
        },
        {
          resourceType: 'Coverage',
          criteria: 'Coverage?beneficiary=%patient',
        },
        {
          resourceType: 'Organization',
          readonly: true,
        },
        {
          resourceType: 'Practitioner',
          readonly: true,
        },
        {
          resourceType: 'Location',
          readonly: true,
        },
      ],
    });
  } else {
    patientAccessPolicy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      meta: {
        project: project.id as string,
      },
      name: 'Default Patient Access Policy',
      compartment: {
        reference: '%patient',
      },
      resource: [
        {
          resourceType: 'Patient',
          criteria: 'Patient?_id=%patient.id',
        },
        {
          resourceType: 'Observation',
          criteria: 'Observation?subject=%patient',
        },
        {
          resourceType: 'Condition',
          criteria: 'Condition?subject=%patient',
        },
        {
          resourceType: 'MedicationRequest',
          criteria: 'MedicationRequest?subject=%patient',
        },
        {
          resourceType: 'MedicationStatement',
          criteria: 'MedicationStatement?subject=%patient',
        },
        {
          resourceType: 'AllergyIntolerance',
          criteria: 'AllergyIntolerance?patient=%patient',
        },
        {
          resourceType: 'Immunization',
          criteria: 'Immunization?patient=%patient',
        },
        {
          resourceType: 'DiagnosticReport',
          criteria: 'DiagnosticReport?subject=%patient',
        },
        {
          resourceType: 'Encounter',
          criteria: 'Encounter?subject=%patient',
        },
        {
          resourceType: 'Procedure',
          criteria: 'Procedure?subject=%patient',
        },
        {
          resourceType: 'Goal',
          criteria: 'Goal?subject=%patient',
        },
        {
          resourceType: 'ImagingStudy',
          criteria: 'ImagingStudy?subject=%patient',
        },
        {
          resourceType: 'FamilyMemberHistory',
          criteria: 'FamilyMemberHistory?patient=%patient',
        },
        {
          resourceType: 'CarePlan',
          criteria: 'CarePlan?subject=%patient',
        },
        {
          resourceType: 'ServiceRequest',
          criteria: 'ServiceRequest?subject=%patient',
        },
        {
          resourceType: 'QuestionnaireResponse',
          criteria: 'QuestionnaireResponse?_compartment=%patient',
        },
        {
          resourceType: 'Questionnaire',
          readonly: true,
        },
        {
          resourceType: 'Communication',
          criteria: 'Communication?subject=%patient',
        },
        {
          resourceType: 'DocumentReference',
          criteria: 'DocumentReference?subject=%patient',
        },
        {
          resourceType: 'Coverage',
          criteria: 'Coverage?beneficiary=%patient',
        },
        {
          resourceType: 'Organization',
          readonly: true,
        },
        {
          resourceType: 'Practitioner',
          readonly: true,
        },
        {
          resourceType: 'Location',
          readonly: true,
        },
      ],
    });

    // Update project with default patient access policy
    project = await systemRepo.updateResource<Project>({
      ...project,
      defaultPatientAccessPolicy: createReference(patientAccessPolicy),
    });
  }

  // Create organizations and locations
  const organizations: Organization[] = [];
  const locations: Location[] = [];
  for (let i = 0; i < 5; i++) {
    const org = await systemRepo.createResource<Organization>({
      ...createOrganization(),
      meta: { project: project.id },
    });
    organizations.push(org);
    const location = await systemRepo.createResource<Location>({
      ...createLocation(org),
      meta: { project: project.id },
    });
    locations.push(location);
  }

  const practitioners: Practitioner[] = [];

  for (const practitionerData of practitionerDataList) {
  const practitioner = await systemRepo.createResource<Practitioner>({
    resourceType: 'Practitioner',
    meta: {
      project: project.id,
    },
    name: [
      {
          ...practitionerData.name,
          prefix: practitionerData.prefix,
        },
      ],
      identifier: [
        {
          system: 'http://hl7.org/fhir/sid/us-npi',
          value: practitionerData.identifier,
      },
    ],
    telecom: [
        {
          system: 'phone',
          value: practitionerData.phone,
        },
      {
        system: 'email',
          value: practitionerData.email,
        },
      ],
    });
    practitioners.push(practitioner);
  }

  const passwordHash = await bcryptHashPassword(DEFAULT_PATIENT_PASSWORD);

  for (let i = 0; i < patientDataList.length; i++) {
    const patientData = patientDataList[i];
    const practitioner = practitioners[i % practitioners.length];
    const organization = organizations[i % organizations.length];
    const location = locations[i % locations.length];

    // Create Patient (check if already exists by email)
    let patient: Patient;
    try {
      const existingPatient = await systemRepo.searchOne<Patient>({
        resourceType: 'Patient',
        filters: [
          {
            code: 'email',
            operator: Operator.EXACT,
            value: patientData.email,
          },
          {
            code: '_project',
            operator: Operator.EQUALS,
            value: project.id as string,
          },
        ],
      });
      if (existingPatient) {
        patient = existingPatient;
      } else {
        patient = await systemRepo.createResource<Patient>({
          resourceType: 'Patient',
          meta: {
            project: project.id,
          },
          name: [patientData.name],
          birthDate: patientData.birthDate,
          gender: patientData.gender,
          address: [
            {
              line: patientData.address.line,
              city: patientData.address.city,
              state: patientData.address.state,
              postalCode: patientData.address.postalCode,
              country: 'US',
            },
          ],
          telecom: [
            {
              system: 'phone',
              value: patientData.phone,
            },
            {
              system: 'email',
              value: patientData.email,
            },
          ],
        });
      }
    } catch {
      // If search fails, try to create
      patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          project: project.id,
        },
        name: [patientData.name],
        birthDate: patientData.birthDate,
        gender: patientData.gender,
        address: [
          {
            line: patientData.address.line,
            city: patientData.address.city,
            state: patientData.address.state,
            postalCode: patientData.address.postalCode,
            country: 'US',
          },
        ],
        telecom: [
          {
            system: 'phone',
            value: patientData.phone,
          },
          {
            system: 'email',
            value: patientData.email,
          },
        ],
      });
    }

    // Create User for patient login (check if already exists)
    let user: User;
    try {
      const existingUser = await systemRepo.searchOne<User>({
        resourceType: 'User',
        filters: [
          {
            code: 'email',
            operator: Operator.EXACT,
            value: patientData.email.toLowerCase(),
          },
          {
            code: 'project',
            operator: Operator.EQUALS,
            value: 'Project/' + project.id,
          },
        ],
      });
      if (existingUser) {
        user = existingUser;
      } else {
        user = await systemRepo.createResource<User>({
          resourceType: 'User',
          meta: {
            project: project.id as string,
          },
          firstName: patientData.name.given[0],
          lastName: patientData.name.family,
          email: patientData.email.toLowerCase(),
          passwordHash,
          project: createReference(project),
        });
      }
    } catch {
      // If search fails, try to create (might be a race condition)
      user = await systemRepo.createResource<User>({
        resourceType: 'User',
        meta: {
          project: project.id as string,
        },
        firstName: patientData.name.given[0],
        lastName: patientData.name.family,
        email: patientData.email.toLowerCase(),
        passwordHash,
        project: createReference(project),
      });
    }

    // Create ProjectMembership to link User to Patient profile (check if already exists)
    try {
      const existingMembership = await systemRepo.searchOne({
        resourceType: 'ProjectMembership',
        filters: [
          {
            code: 'user',
            operator: Operator.EQUALS,
            value: 'User/' + user.id,
          },
          {
            code: 'project',
            operator: Operator.EQUALS,
            value: 'Project/' + project.id,
          },
        ],
      });
      if (!existingMembership) {
        await createProjectMembership(systemRepo, user, project, patient, {
          accessPolicy: createReference(patientAccessPolicy),
        });
      }
    } catch {
      // If search fails, try to create
      await createProjectMembership(systemRepo, user, project, patient, {
        accessPolicy: createReference(patientAccessPolicy),
      });
    }

    const encounterDate = new Date();
    encounterDate.setDate(encounterDate.getDate() - randomInt(1, 30));
  const encounter = await systemRepo.createResource<Encounter>({
    resourceType: 'Encounter',
    meta: {
      project: project.id,
    },
    status: 'finished',
    class: { code: 'AMB', display: 'ambulatory' },
    subject: createReference(patient),
      serviceProvider: createReference(organization),
      location: [
        {
          location: createReference(location),
        },
      ],
      period: {
        start: encounterDate.toISOString(),
        end: new Date(encounterDate.getTime() + 30 * 60 * 1000).toISOString(),
      },
    participant: [
      {
        individual: createReference(practitioner),
      },
    ],
  });

    // Create 2-3 blood pressure measurements with different dates
    const bpCount = randomInt(2, 3);
    for (let bpIndex = 0; bpIndex < bpCount; bpIndex++) {
      const bpDate = new Date();
      bpDate.setDate(bpDate.getDate() - randomInt(0, 30));
      bpDate.setHours(randomInt(8, 17), randomInt(0, 59), 0, 0);
      
      const systolic = randomInt(110, 140);
      const diastolic = randomInt(70, 90);
      
      await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        meta: {
          project: project.id,
        },
        status: 'final',
        subject: createReference(patient),
        encounter: createReference(encounter),
        effectiveDateTime: bpDate.toISOString(),
        code: {
          coding: [
            {
              system: LOINC,
              code: '85354-9',
              display: 'Blood Pressure',
            },
          ],
        },
        component: [
          {
            code: {
              coding: [
                {
                  system: LOINC,
                  code: '8480-6',
                  display: 'Systolic Blood Pressure',
                },
              ],
            },
            valueQuantity: {
              value: systolic,
              unit: 'mm[Hg]',
              system: UCUM,
              code: 'mm[Hg]',
            },
          },
          {
            code: {
              coding: [
                {
                  system: LOINC,
                  code: '8462-4',
                  display: 'Diastolic Blood Pressure',
                },
              ],
            },
            valueQuantity: {
              value: diastolic,
              unit: 'mm[Hg]',
              system: UCUM,
              code: 'mm[Hg]',
            },
          },
        ],
      });
    }

    // Create 2-3 temperature measurements with different dates
    const tempCount = randomInt(2, 3);
    for (let tempIndex = 0; tempIndex < tempCount; tempIndex++) {
      const tempDate = new Date();
      tempDate.setDate(tempDate.getDate() - randomInt(0, 30));
      tempDate.setHours(randomInt(8, 17), randomInt(0, 59), 0, 0);
      
      const temperature = randomFloat(36.5, 37.5, 1);
      
      await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        meta: {
          project: project.id,
        },
        status: 'final',
        subject: createReference(patient),
        encounter: createReference(encounter),
        effectiveDateTime: tempDate.toISOString(),
        code: {
          coding: [
            {
              system: LOINC,
              code: '8310-5',
              display: 'Body Temperature',
            },
          ],
        },
        valueQuantity: {
          value: temperature,
          unit: 'Cel',
          system: UCUM,
          code: 'Cel',
        },
      });
    }

    await systemRepo.createResource({
      ...createWeightObservation(patient, encounter, encounterDate),
      meta: { project: project.id },
    });
    await systemRepo.createResource({
      ...createHeightObservation(patient, encounter, encounterDate),
      meta: { project: project.id },
    });
    await systemRepo.createResource({
      ...createHeartRateObservation(patient, encounter, encounterDate),
      meta: { project: project.id },
    });
    await systemRepo.createResource({
      ...createRespiratoryRateObservation(patient, encounter, encounterDate),
      meta: { project: project.id },
    });

    if (Math.random() > 0.5) {
      await systemRepo.createResource({
        ...createGlucoseObservation(patient, encounter, encounterDate),
        meta: { project: project.id },
      });
    }

    if (Math.random() > 0.3) {
      await systemRepo.createResource({
        ...createCondition(patient, practitioner),
        meta: { project: project.id },
      });
    }

    if (Math.random() > 0.4) {
      await systemRepo.createResource({
        ...createMedicationRequest(patient, practitioner),
        meta: { project: project.id },
      });
    }

    if (Math.random() > 0.5) {
      await systemRepo.createResource({
        ...createMedicationStatement(patient),
        meta: { project: project.id },
      });
    }

    const allergy = createAllergyIntolerance(patient, practitioner);
    if (allergy) {
      await systemRepo.createResource({
        ...allergy,
        meta: { project: project.id },
      });
    }

    const immunization = createImmunization(patient, practitioner);
    if (immunization) {
      await systemRepo.createResource({
        ...immunization,
        meta: { project: project.id },
      });
    }

    if (Math.random() > 0.5) {
      await systemRepo.createResource({
        ...createDiagnosticReport(patient, encounter, practitioner),
        meta: { project: project.id },
      });
    }

    const carePlan = createCarePlan(patient, practitioner);
    if (carePlan) {
      await systemRepo.createResource({
        ...carePlan,
        meta: { project: project.id },
      });
    }

    const serviceRequest = createServiceRequest(patient, practitioner, encounter);
    if (serviceRequest) {
      await systemRepo.createResource({
        ...serviceRequest,
        meta: { project: project.id },
      });
    }

    const procedure = createProcedure(patient, practitioner, encounter);
    if (procedure) {
      await systemRepo.createResource({
        ...procedure,
        meta: { project: project.id },
      });
    }

    const goal = createGoal(patient, practitioner);
    if (goal) {
      await systemRepo.createResource({
        ...goal,
        meta: { project: project.id },
      });
    }

    const imagingStudy = createImagingStudy(patient, practitioner, encounter);
    if (imagingStudy) {
      await systemRepo.createResource({
        ...imagingStudy,
        meta: { project: project.id },
      });
    }

    const familyMemberHistory = createFamilyMemberHistory(patient);
    if (familyMemberHistory) {
      await systemRepo.createResource({
        ...familyMemberHistory,
        meta: { project: project.id },
      });
    }
  }
}
