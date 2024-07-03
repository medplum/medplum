import { BotEvent, createReference, getReferenceString, LOINC, MedplumClient, SNOMED, UCUM } from '@medplum/core';
import {
  AllergyIntolerance,
  BundleEntry,
  CarePlan,
  Communication,
  Condition,
  DiagnosticReport,
  Immunization,
  MedicationRequest,
  Observation,
  Patient,
  Practitioner,
  Reference,
  RequestGroup,
  RequestGroupAction,
  Resource,
  Schedule,
  Task,
} from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  const patientHistory = await medplum.readHistory('Patient', patient.id as string);
  if ((patientHistory.entry as BundleEntry[]).length > 1) {
    console.log('Patient already has history');
    return;
  }

  console.log('Creating questionnaire library...');
  await ensureQuestionnaire(medplum);

  console.log('Setting practitioner...');
  const practitioner = await getPractitioner(medplum);
  patient.generalPractitioner = [createReference(practitioner)];
  await medplum.updateResource(patient);

  console.log('Creating A1C...');
  const a1c = await medplum.createResource(createA1CObservation(patient));

  console.log('Creating Care Plans...');
  await createCompletedCarePlan(medplum, patient);
  await createActiveCarePlan(medplum, patient);

  const entries: BundleEntry[] = [];
  entries.push(createEntry(createDiagnosticReport(patient, a1c)));
  entries.push(createEntry(createActiveMedicationRequest(patient, practitioner)));
  entries.push(createEntry(createStoppedMedicationRequest(patient, practitioner)));
  entries.push(createEntry(createAllergyIntolerance(patient, practitioner)));
  entries.push(createEntry(createMedicalCondition(patient, practitioner)));
  entries.push(createEntry(createCompletedImmunization(patient)));
  entries.push(createEntry(createIncompleteImmunization(patient)));

  // Simulate 10 visits
  for (let i = 0; i < 10; i++) {
    // Date is 10 days ago
    const date = new Date();
    date.setDate(date.getDate() - 10 + i);
    entries.push(createEntry(createBloodPressureObservation(patient, date)));
    entries.push(createEntry(createTemperatureObservation(patient, date)));
    entries.push(createEntry(createHeightObservation(patient, date)));
    entries.push(createEntry(createWeightObservation(patient, date)));
    entries.push(createEntry(createRespiratoryRateObservation(patient, date)));
    entries.push(createEntry(createHeartRateObservation(patient, date)));
  }

  entries.push(createEntry(createWelcomeMessage(patient, practitioner)));

  console.log('Creating history...');
  const result = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'batch',
    entry: entries,
  });
  console.log(result.entry?.map((entry) => entry.response?.status));
}

/**
 * Creates the questionnaire if one does not already exist.
 * @param medplum - The medplum client.
 */
async function ensureQuestionnaire(medplum: MedplumClient): Promise<void> {
  const questionnaire = await medplum.searchOne('Questionnaire', 'title=Order Lab Tests');
  if (questionnaire) {
    return;
  }
  await medplum.createResource({
    resourceType: 'Questionnaire',
    name: 'Lab Test Orders',
    title: 'Order Lab Tests',
    status: 'active',
    item: [
      {
        id: 'id-4',
        linkId: 'g2',
        type: 'display',
        text: 'For guidance on which labs to order visit: https://www.uptodate.com/contents/search?search=lab%20orders',
      },
      {
        id: 'id-2',
        linkId: 'panel',
        type: 'choice',
        text: 'What type of lab would you like to order?',
        answerOption: [
          {
            id: 'id-3',
            valueString: 'Metabolic Panel LOINC: 24323-8',
          },
          {
            id: 'id-4',
            valueString: 'Lipid Panel LOINC: 24331-1',
          },
          {
            id: 'id-5',
            valueString: 'CBC With Differential LOINC: 57021-8',
          },
        ],
      },
      {
        id: 'id-6',
        linkId: 'specimen',
        type: 'choice',
        text: 'What specimen type is required?',
        answerOption: [
          {
            id: 'id-7',
            valueString: 'Serum/Plasma',
          },
          {
            id: 'id-8',
            valueString: 'Whole blood',
          },
        ],
      },
    ],
    subjectType: ['Patient'],
  });
}

/**
 * Returns a practitioner resource.
 * Creates the practitioner if one does not already exist.
 * @param medplum - The medplum client.
 * @returns The practitioner resource.
 */
async function getPractitioner(medplum: MedplumClient): Promise<Practitioner> {
  const practitioner = await medplum.createResourceIfNoneExist<Practitioner>(
    {
      resourceType: 'Practitioner',
      identifier: [
        {
          system: 'http://hl7.org/fhir/sid/us-npi',
          value: '123456789',
        },
      ],
      name: [
        {
          given: ['Alice'],
          family: 'Smith',
        },
      ],
      photo: [
        {
          contentType: 'image/png',
          url: 'https://docs.medplum.com/img/cdc-femaledoc.png',
        },
      ],
    },
    'identifier=123456789'
  );

  // Make sure the practitioner has a schedule
  await ensureSchedule(medplum, practitioner);

  return practitioner;
}

/**
 * Ensures that the practitioner has a schedule, and that the schedule has slots.
 * @param medplum - The medplum client.
 * @param practitioner - The practitioner.
 */
async function ensureSchedule(medplum: MedplumClient, practitioner: Practitioner): Promise<void> {
  // Try to get the schedule
  const schedule = await medplum.createResourceIfNoneExist<Schedule>(
    {
      resourceType: 'Schedule',
      id: 'schedule',
      actor: [createReference(practitioner)],
    },
    'actor=Practitioner/' + practitioner.id
  );

  // Ensure there are slots for the next 30 days
  const slotDate = new Date();
  for (let day = 0; day < 30; day++) {
    slotDate.setHours(0, 0, 0, 0);
    await ensureSlots(medplum, schedule, slotDate);
    slotDate.setDate(slotDate.getDate() + 1);
  }
}

/**
 * Ensures that the schedule has slots for the given date.
 * @param medplum - The medplum client.
 * @param schedule - The practitioner's schedule.
 * @param slotDate - The day of slots.
 */
async function ensureSlots(medplum: MedplumClient, schedule: Schedule, slotDate: Date): Promise<void> {
  const existingSlots = await medplum.search(
    'Slot',
    new URLSearchParams([
      ['_summary', 'true'],
      ['schedule', getReferenceString(schedule)],
      ['start', 'gt' + slotDate.toISOString()],
      ['start', 'lt' + new Date(slotDate.getTime() + 24 * 60 * 60 * 1000).toISOString()],
    ])
  );

  if ((existingSlots.total as number) > 0) {
    return;
  }

  for (let hour = 0; hour < 24; hour++) {
    slotDate.setHours(hour, 0, 0, 0);
    await medplum.createResource({
      resourceType: 'Slot',
      status: 'free',
      start: slotDate.toISOString(),
      end: new Date(slotDate.getTime() + 30 * 60 * 1000).toISOString(),
      schedule: createReference(schedule),
    });
  }
}

/**
 * Creates a CarePlan that was completed in the past.
 * @param medplum - The medplum client
 * @param patient - The patient.
 */
async function createCompletedCarePlan(medplum: MedplumClient, patient: Patient): Promise<void> {
  const tasks: Task[] = [
    {
      resourceType: 'Task',
      intent: 'order',
      status: 'completed',
      code: { text: 'medical-history' },
      description: 'Complete Medical History',
      location: {
        display: 'AT HOME',
      },
      owner: createReference(patient),
      focus: createReference(patient),
    },
    {
      resourceType: 'Task',
      intent: 'order',
      status: 'completed',
      code: { text: 'respiratory-screening' },
      description: 'Respiratory Screening',
      location: {
        display: 'FOOMEDICAL HOSPITAL AND MEDICAL CENTERS',
      },
      executionPeriod: {
        start: '2020-01-01T00:00:00.000Z',
        end: '2021-01-01T00:00:00.000Z',
      },
      owner: createReference(patient),
      focus: createReference(patient),
    },
  ];

  await createCarePlan(medplum, patient, tasks);
}

/**
 * Creates an active CarePlan that starts today.
 * @param medplum - The medplum client
 * @param patient - The patient.
 */
async function createActiveCarePlan(medplum: MedplumClient, patient: Patient): Promise<void> {
  const tasks: Task[] = [
    {
      resourceType: 'Task',
      intent: 'order',
      status: 'in-progress',
      code: { text: 'antenatal-education' },
      location: {
        display: 'AT HOME',
      },
      description: 'Routine Antenatal Care',
      owner: createReference(patient),
      focus: createReference(patient),
      executionPeriod: {
        start: new Date().toISOString(),
      },
    },
  ];
  await createCarePlan(medplum, patient, tasks);
}

/**
 * Creates a Care Plan based on the tasks for the given patient
 * @param medplum - The medplum client
 * @param patient - The patient
 * @param tasks - The set of tasks to complete for the care plan
 * @returns The created care plan
 */
async function createCarePlan(medplum: MedplumClient, patient: Patient, tasks: Task[]): Promise<CarePlan> {
  tasks = await Promise.all(
    tasks.map((task) => {
      task.owner = createReference(patient);
      return medplum.createResource(task);
    })
  );

  const requestGroup = await medplum.createResource<RequestGroup>({
    resourceType: 'RequestGroup',
    status: 'active',
    intent: 'order',
    subject: createReference(patient),
    action: tasks.map(
      (t: Task): RequestGroupAction => ({
        resource: createReference(t),
        title: t.description,
        participant: [t.owner as Reference<Patient>],
      })
    ),
  });

  const carePlan: CarePlan = await medplum.createResource<CarePlan>({
    resourceType: 'CarePlan',
    status: 'active',
    intent: 'order',
    title: tasks[0].description,
    subject: createReference(patient),
    activity: [
      {
        reference: createReference(requestGroup),
      },
    ],
  });

  return carePlan;
}

function createA1CObservation(patient: Patient): Observation {
  return {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    code: {
      text: 'Hemoglobin A1c',
    },
    valueQuantity: {
      value: 5.4,
      unit: 'mmol/L',
    },
    referenceRange: [
      {
        high: {
          value: 7.0,
        },
      },
    ],
  };
}

/**
 * Creates a DiagnosticReport with an A1C observation.
 * @param patient - The patient.
 * @param a1c - The A1C observation.
 * @returns The DiagnosticReport.
 */
function createDiagnosticReport(patient: Patient, a1c: Observation): DiagnosticReport {
  return {
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: {
      text: 'Hemoglobin A1c',
    },
    subject: createReference(patient),
    result: [createReference(a1c)],
  };
}

function createActiveMedicationRequest(patient: Patient, practitioner: Practitioner): MedicationRequest {
  return {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    priority: 'routine',
    subject: createReference(patient),
    requester: createReference(practitioner),
    dosageInstruction: [
      {
        text: 'Every six hours (qualifier value)',
        sequence: 1,
        timing: {
          repeat: {
            frequency: 4,
            period: 1,
            periodUnit: 'd',
          },
        },
      },
    ],
    authoredOn: new Date().toISOString(),
    medicationCodeableConcept: {
      text: 'Amoxicillin 500mg',
    },
    supportingInformation: [
      {
        reference: 'https://www.nlm.nih.gov/medlineplus/druginfo/meds/a682053.html',
      },
      {
        reference: 'https://www.drugs.com/amoxicillin.html',
      },
      {
        reference: 'https://www.drugs.com/cons/amoxicillin.html',
      },
    ],
  };
}

function createStoppedMedicationRequest(patient: Patient, practitioner: Practitioner): MedicationRequest {
  return {
    resourceType: 'MedicationRequest',
    status: 'stopped',
    intent: 'order',
    priority: 'routine',
    subject: createReference(patient),
    requester: createReference(practitioner),
    dosageInstruction: [
      {
        text: 'Every seventy two hours as needed (qualifier value)',
        sequence: 1,
        timing: {
          repeat: {
            frequency: 1,
            period: 3,
            periodUnit: 'd',
          },
        },
      },
    ],
    authoredOn: new Date().toISOString(),
    medicationCodeableConcept: {
      text: 'Biaxin XL (clarithromycin) 500mg',
    },
  };
}

function createAllergyIntolerance(patient: Patient, practitioner: Practitioner): AllergyIntolerance {
  return {
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      text: 'Active',
      coding: [
        {
          system: 'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    verificationStatus: {
      text: 'Confirmed',
      coding: [
        {
          system: 'http://hl7.org/fhir/ValueSet/allergyintolerance-verification',
          code: 'confirmed',
          display: 'Confirmed',
        },
      ],
    },
    type: 'allergy',
    category: ['medication'],
    criticality: 'high',
    patient: createReference(patient),
    code: {
      text: 'penicillin',
    },
    note: [
      {
        text: 'Allergy decision support resource: https://www.uptodate.com/contents/search?search=penicillin%20allergy',
        authorReference: createReference(practitioner),
      },
    ],
  };
}

function createMedicalCondition(patient: Patient, practitioner: Practitioner): Condition {
  return {
    resourceType: 'Condition',
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'resolved',
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
          code: '192127007',
          display: 'Child attention deficit disorder',
        },
      ],
      text: 'Child attention deficit disorder',
    },
    subject: createReference(patient),
    note: [
      {
        text: 'Medical Condition Clinical Decision Support: https://www.uptodate.com/contents/search?search=adhd',
        authorReference: createReference(practitioner),
      },
    ],
    onsetDateTime: '2016-01-29T14:05:06-08:00',
    abatementDateTime: '2016-05-11T18:05:06-07:00',
    recordedDate: '2016-01-29T14:05:06-08:00',
  };
}

function createCompletedImmunization(patient: Patient): Immunization {
  return {
    resourceType: 'Immunization',
    status: 'completed',
    patient: createReference(patient),
    location: {
      display: 'FOOMEDICAL HOSPITAL AND MEDICAL CENTERS',
    },
    occurrenceDateTime: new Date().toISOString(),
    vaccineCode: {
      text: 'SARS-COV-2 (COVID-19) vaccine, mRNA, spike protein, LNP, preservative free, 100 mcg/0.5mL dose',
    },
  };
}

function createIncompleteImmunization(patient: Patient): Immunization {
  return {
    resourceType: 'Immunization',
    status: 'not-done',
    patient: createReference(patient),
    location: {
      display: 'FOOMEDICAL HOSPITAL AND MEDICAL CENTERS',
    },
    vaccineCode: {
      text: 'Influenza, seasonal, injectable, preservative free',
    },
  };
}

function createBloodPressureObservation(patient: Patient, date: Date): Observation {
  return {
    resourceType: 'Observation',
    subject: createReference(patient),
    issued: date.toISOString(),
    effectiveDateTime: date.toISOString(),
    code: {
      coding: [
        {
          code: '85354-9',
          display: 'Blood Pressure',
          system: LOINC,
        },
      ],
      text: 'Blood Pressure',
    },
    component: [
      {
        code: {
          coding: [
            {
              code: '8462-4',
              display: 'Diastolic Blood Pressure',
              system: LOINC,
            },
          ],
          text: 'Diastolic Blood Pressure',
        },
        valueQuantity: {
          code: 'mm[Hg]',
          system: UCUM,
          unit: 'mm[Hg]',
          value: 80 * observationRandomizer(),
        },
      },
      {
        code: {
          coding: [
            {
              code: '8480-6',
              display: 'Systolic Blood Pressure',
              system: LOINC,
            },
          ],
          text: 'Systolic Blood Pressure',
        },
        valueQuantity: {
          code: 'mm[Hg]',
          system: UCUM,
          unit: 'mm[Hg]',
          value: 120 * observationRandomizer(),
        },
      },
    ],
    status: 'final',
  };
}

function createTemperatureObservation(patient: Patient, date: Date): Observation {
  return {
    resourceType: 'Observation',
    subject: createReference(patient),
    issued: date.toISOString(),
    effectiveDateTime: date.toISOString(),
    code: {
      coding: [
        {
          code: '8310-5',
          display: 'Body temperature',
          system: LOINC,
        },
        {
          code: '8331-1',
          display: 'Oral temperature',
          system: LOINC,
        },
      ],
      text: 'Body temperature',
    },
    valueQuantity: {
      code: 'Cel',
      system: UCUM,
      unit: 'Cel',
      value: 36.6 * observationRandomizer(),
    },
    status: 'final',
  };
}

function createHeightObservation(patient: Patient, date: Date): Observation {
  return {
    resourceType: 'Observation',
    subject: createReference(patient),
    issued: date.toISOString(),
    effectiveDateTime: date.toISOString(),
    code: {
      coding: [
        {
          code: '8302-2',
          display: 'Body Height',
          system: LOINC,
        },
      ],
      text: 'Body Height',
    },
    valueQuantity: {
      code: 'cm',
      system: UCUM,
      unit: 'cm',
      value: 175 * observationRandomizer(),
    },
    status: 'final',
  };
}

function createWeightObservation(patient: Patient, date: Date): Observation {
  return {
    resourceType: 'Observation',
    subject: createReference(patient),
    issued: date.toISOString(),
    effectiveDateTime: date.toISOString(),
    code: {
      coding: [
        {
          code: '29463-7',
          display: 'Body Weight',
          system: LOINC,
        },
      ],
      text: 'Body Weight',
    },
    valueQuantity: {
      code: 'kg',
      system: UCUM,
      unit: 'kg',
      value: 70 * observationRandomizer(),
    },
    status: 'final',
  };
}

function createRespiratoryRateObservation(patient: Patient, date: Date): Observation {
  return {
    resourceType: 'Observation',
    subject: createReference(patient),
    issued: date.toISOString(),
    effectiveDateTime: date.toISOString(),
    code: {
      coding: [
        {
          code: '9279-1',
          display: 'Respiratory rate',
          system: LOINC,
        },
      ],
      text: 'Respiratory rate',
    },
    valueQuantity: {
      code: '/min',
      system: UCUM,
      unit: '/min',
      value: 15 * observationRandomizer(),
    },
    status: 'final',
  };
}

function createHeartRateObservation(patient: Patient, date: Date): Observation {
  return {
    resourceType: 'Observation',
    subject: createReference(patient),
    issued: date.toISOString(),
    effectiveDateTime: date.toISOString(),
    code: {
      coding: [
        {
          code: '8867-4',
          display: 'Heart rate',
          system: LOINC,
        },
      ],
      text: 'Heart rate',
    },
    valueQuantity: {
      code: '/min',
      system: UCUM,
      unit: '/min',
      value: 80 * observationRandomizer(),
    },
    status: 'final',
  };
}

function createWelcomeMessage(patient: Patient, practitioner: Practitioner): Communication {
  return {
    resourceType: 'Communication',
    status: 'completed',
    subject: createReference(patient),
    recipient: [createReference(patient)],
    sender: createReference(practitioner),
    payload: [
      {
        contentString: 'Hello and welcome to our practice',
      },
    ],
  };
}

function createEntry(resource: Resource): BundleEntry {
  return {
    resource,
    request: {
      url: resource.resourceType,
      method: 'POST',
    },
  };
}

function observationRandomizer(): number {
  // Return +/- 1%
  return 0.99 + Math.random() * 0.02;
}
