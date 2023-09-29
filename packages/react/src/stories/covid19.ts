import { LOINC, SNOMED, UCUM, createReference, getReferenceString } from '@medplum/core';
import {
  ActivityDefinition,
  ObservationDefinition,
  PlanDefinition,
  Questionnaire,
  RequestGroup,
  ServiceRequest,
  SpecimenDefinition,
  Task,
} from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule, HomerDiagnosticReport, HomerSimpson } from '@medplum/mock';

export const Covid19AssessmentQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  url: 'http://fhir.data4life.care/covid-19/r4/Questionnaire/covid19-recommendation',
  version: '4.0.0',
  date: '2021-02-08T22:00:00.000Z',
  subjectType: ['Patient'],
  useContext: [
    {
      code: {
        system: 'http://provider.foomedical.com',
        code: 'questionnaireType',
      },
      valueCodeableConcept: {
        text: 'patient-form',
      },
    },
  ],
  status: 'draft',
  publisher: 'Good Health Clinic',
  contact: [
    {
      name: 'D4L data4life gGmbH',
      telecom: [
        {
          system: 'url',
          value: 'https://www.data4life.care',
        },
      ],
    },
  ],
  description: 'COVID-19 Assessment Questionnaire',
  name: 'COVID-19 Assessment Questionnaire',
  code: [
    {
      system: LOINC,
      code: '84170-0',
      display: 'Infectious disease Risk assessment and screening note',
    },
  ],
  item: [
    {
      type: 'group',
      required: true,
      linkId: 'P',
      text: 'Personal information',
      item: [
        {
          type: 'choice',
          required: true,
          linkId: 'P1',
          code: [
            {
              code: '21612-7',
              display: 'Age - Reported',
              system: LOINC,
            },
          ],
          text: 'Are you 65 years old or older?',
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/yesno',
          answerOption: [
            {
              valueString: 'Yes',
              id: 'id-1000',
            },
            {
              valueString: 'No',
              id: 'id-1001',
            },
          ],
        },
        {
          type: 'choice',
          required: true,
          linkId: 'P2',
          code: [
            {
              code: '71802-3',
              display: 'Housing status',
              system: LOINC,
            },
          ],
          text: 'What is your current living situation?',
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/housing-situation',
          answerOption: [
            {
              valueString: 'Lives alone',
              id: 'id-1100',
            },
            {
              valueString: 'Lives with other(s)',
              id: 'id-1101',
            },
          ],
        },
        {
          type: 'choice',
          required: true,
          linkId: 'P3',
          text: 'At least once a week, do you privately care for people with age-related conditions, chronic illnesses, or frailty?',
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/yesno',
          item: [
            {
              linkId: 'P3-Explanation',
              type: 'display',
              text: "Care services or support that you provide in connection with your professional activity isn't meant.",
            },
          ],
          answerOption: [
            {
              valueString: 'Yes',
              id: 'id-1200',
            },
            {
              valueString: 'No',
              id: 'id-1201',
            },
          ],
        },
        {
          type: 'choice',
          required: true,
          linkId: 'P4-revised',
          text: 'Do you work or are you cared for/accommodated in one of the following areas?',
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/shared-location-class',
          answerOption: [
            {
              valueString: "Working in the medical field (care, doctor's office, hospital, or similar)",
              id: 'id-1300',
            },
            {
              valueString: 'Working in a community facility (school, day care center, university, care home, etc.)',
              id: 'id-1301',
            },
            {
              valueString:
                'Cared for or accommodated in a community facility (school, day care center, care home, etc.)',
              id: 'id-1302',
            },
            {
              valueString: 'Cared for or accommodated in the medical sector (care or hospital)',
              id: 'id-1303',
            },
            {
              valueString: 'No',
              id: 'id-1304',
            },
          ],
        },
        {
          type: 'choice',
          required: true,
          linkId: 'P5',
          code: [
            {
              code: '72166-2',
              display: 'Tobacco smoking status',
              system: LOINC,
            },
          ],
          text: 'Do you smoke?',
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/yesno',
          answerOption: [
            {
              valueString: 'Yes',
              id: 'id-1400',
            },
            {
              valueString: 'No',
              id: 'id-1401',
            },
          ],
        },
        {
          type: 'choice',
          required: true,
          linkId: 'P6',
          code: [
            {
              code: '82810-3',
              display: 'Pregnancy status',
              system: LOINC,
            },
          ],
          text: 'Are you pregnant?',
          answerValueSet: 'http://loinc.org/vs/LL4129-4',
          answerOption: [
            {
              valueString: 'Pregnant',
              id: 'id-1500',
            },
            {
              valueString: 'Not pregnant',
              id: 'id-1501',
            },
            {
              valueString: 'Unknown',
              id: 'id-1502',
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      required: true,
      linkId: 'C',
      text: 'Contact with COVID-19 cases',
      item: [
        {
          type: 'choice',
          required: true,
          linkId: 'C0',
          code: [
            {
              code: '840546002',
              display: 'Exposure to SARS-CoV-2',
              system: SNOMED,
            },
          ],
          text: 'Have you had close contact with a confirmed case?',
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/yesno',
          item: [
            {
              linkId: 'C0-Explanation',
              type: 'display',
              text: 'Close contact with a confirmed case means:\n\n* Face-to-face contact for longer than 15 minutes\n* Direct, physical contact (touching, shaking hands, kissing)\n* Being within 1.5 meters of the person for more than 15 minutes\n* Contact with or exchange of body fluids\n* Living in the same apartment\n\n\nChoose "no" if you have worn adequate protective measures (mask, smock) on contact.',
            },
          ],
          answerOption: [
            {
              valueString: 'Yes',
              id: 'id-1000',
            },
            {
              valueString: 'No',
              id: 'id-1001',
            },
          ],
        },
        {
          type: 'date',
          required: true,
          linkId: 'CZ',
          code: [
            {
              code: '94652-5',
              display: 'Known exposure date',
              system: LOINC,
            },
          ],
          text: 'What day was the last contact?',
          enableWhen: [
            {
              question: 'C0',
              operator: '=',
              answerCoding: {
                system: LOINC,
                code: 'LA33-6',
              },
            },
          ],
          item: [
            {
              linkId: 'CZ-Explanation',
              type: 'display',
              text: 'Ensure that you enter a full date in the DD MM YYYY format that isn’t in the future.',
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      required: true,
      linkId: 'S',
      text: 'Symptoms',
      item: [
        {
          type: 'choice',
          required: false,
          linkId: 'X0',
          code: [
            {
              code: '75325-1',
              display: 'Symptom',
              system: LOINC,
            },
          ],
          text: 'In the past 24 hours, which of the following symptoms have you had? (multiple selection possible)',
          repeats: true,
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/covapp-symptoms-group-1',
          item: [
            {
              linkId: 'X0-Explanation',
              type: 'display',
              text: 'The question relates to acute or exacerbated symptoms and excludes chronic complaints or seasonal or allergic complaints. If you have a chronic illness, compare your current symptoms with your previous problems to answer the question.\n\nIf you haven\'t had any of the symptoms, choose the "Next" button without selecting a symptom.',
            },
          ],
          answerOption: [
            {
              valueString: 'Fever above 38°C',
              id: 'id-1000',
            },
            {
              valueString: 'Chills',
              id: 'id-1001',
            },
            {
              valueString: 'Body aches',
              id: 'id-1002',
            },
            {
              valueString: 'Loss of taste or smell',
              id: 'id-1003',
            },
          ],
        },
        {
          type: 'choice',
          required: false,
          linkId: 'X2',
          code: [
            {
              code: '75325-1',
              display: 'Symptom',
              system: LOINC,
            },
          ],
          text: 'In the past 24 hours, which of the following symptoms have you had? (multiple selection possible)',
          repeats: true,
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/covapp-symptoms-group-2',
          item: [
            {
              linkId: 'X2-Explanation',
              type: 'display',
              text: 'If you haven\'t had any of the symptoms, choose the "Next" button without selecting a symptom.',
            },
          ],
          answerOption: [
            {
              valueString: 'Feeling tired or weak',
              id: 'id-1100',
            },
            {
              valueString: 'Persistent cough',
              id: 'id-1101',
            },
            {
              valueString: 'Runny nose',
              id: 'id-1102',
            },
            {
              valueString: 'Diarrhea',
              id: 'id-1103',
            },
            {
              valueString: 'Sore throat',
              id: 'id-1104',
            },
            {
              valueString: 'Headache',
              id: 'id-1105',
            },
          ],
        },
        {
          type: 'choice',
          required: true,
          linkId: 'SB',
          code: [
            {
              code: '267036007',
              display: 'Dyspnea (finding)',
              system: SNOMED,
            },
          ],
          text: 'In the past 24 hours, did you feel that you were more quickly out of breath than usual?',
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/yesno',
          item: [
            {
              linkId: 'SB-Explanation',
              type: 'display',
              text: 'Choose "Yes" if you have difficulty breathing or shortness of breath:\n- While sitting or lying down\n- When getting up from a bed or a chair\n- After light activity, such as going for a walk or climbing some stairs\n\nIf you have chronic lung disease, compare your current breathing problems with your previous breathing problems.',
            },
          ],
          answerOption: [
            {
              valueString: 'Yes',
              id: 'id-1200',
            },
            {
              valueString: 'No',
              id: 'id-1201',
            },
          ],
        },
        {
          type: 'date',
          required: true,
          linkId: 'SZ',
          code: [
            {
              code: '85585-8',
              display: 'Date of condition onset',
              system: LOINC,
            },
          ],
          text: 'With regard to all questions about symptoms: since when have you had the symptoms you specified?',
          enableWhen: [
            {
              question: 'X0',
              operator: 'exists',
              answerBoolean: true,
            },
            {
              question: 'X2',
              operator: 'exists',
              answerBoolean: true,
            },
            {
              question: 'SB',
              operator: '=',
              answerCoding: {
                system: LOINC,
                code: 'LA33-6',
              },
            },
          ],
          enableBehavior: 'any',
          item: [
            {
              linkId: 'SZ-Explanation',
              type: 'display',
              text: 'Make sure to enter a full date in the DD MM YYYY format that isn’t in the future.',
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      required: false,
      linkId: 'D',
      text: 'Chronic illnesses',
      item: [
        {
          type: 'choice',
          required: false,
          linkId: 'X3',
          text: 'Has a doctor diagnosed you with any of the following illnesses?',
          repeats: true,
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/covapp-chronic-disease',
          item: [
            {
              linkId: 'X3-Explanation',
              type: 'display',
              text: 'If you don\'t have any of the illnesses, choose the "Next" button without selecting a symptom.',
            },
          ],
          answerOption: [
            {
              valueString: 'Heart disease',
              id: 'id-1000',
            },
            {
              valueString: 'Lung disease',
              id: 'id-1001',
            },
            {
              valueString: 'Immunodeficiency',
              id: 'id-1002',
            },
            {
              valueString: 'Diabetes',
              id: 'id-1003',
            },
            {
              valueString: 'Obesity',
              id: 'id-1004',
            },
            {
              valueString: 'Other',
              id: 'id-1005',
            },
          ],
        },
        {
          type: 'integer',
          required: false,
          linkId: 'D6',
          code: [
            {
              system: LOINC,
              code: '8302-2',
              display: 'Body height',
            },
          ],
          text: "What's your height? (in cm)",
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/maxValue',
              valueDecimal: 300,
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/minValue',
              valueDecimal: 10,
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
              valueCoding: {
                system: UCUM,
                code: 'cm',
                display: '[cm]',
              },
            },
          ],
          item: [
            {
              linkId: 'D6-Explanation',
              type: 'display',
              text: 'We use your height and weight to calculate your body mass index (BMI). The BMI can be a risk factor in the context of COVID-19.',
            },
          ],
        },
        {
          type: 'integer',
          required: false,
          linkId: 'D5',
          code: [
            {
              system: LOINC,
              code: '29463-7',
              display: 'Body Weight',
            },
          ],
          text: "What's your weight? (in kg)",
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/maxValue',
              valueDecimal: 600,
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/minValue',
              valueDecimal: 0,
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
              valueCoding: {
                system: UCUM,
                code: 'kg',
                display: '[kg]',
              },
            },
          ],
          item: [
            {
              linkId: 'D5-Explanation',
              type: 'display',
              text: 'We use your height and weight to calculate your body mass index (BMI). The BMI can be a risk factor in the context of COVID-19.',
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      required: true,
      linkId: 'M',
      text: 'Medication',
      item: [
        {
          type: 'choice',
          required: true,
          linkId: 'M0',
          code: [
            {
              code: 'steroid-intake',
              display: 'Taking steroids',
              system: 'http://fhir.data4life.care/covid-19/r4/CodeSystem/medication-questions',
            },
          ],
          text: 'Are you currently taking steroids?',
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/yesnodontknow',
          answerOption: [
            {
              valueString: 'Yes',
              id: 'id-1000',
            },
            {
              valueString: 'No',
              id: 'id-1001',
            },
            {
              valueString: "Don't know",
              id: 'id-1002',
            },
          ],
        },
        {
          type: 'choice',
          required: true,
          linkId: 'M1',
          code: [
            {
              code: 'immunosuppressant-intake',
              display: 'Taking immunosuppressants',
              system: 'http://fhir.data4life.care/covid-19/r4/CodeSystem/medication-questions',
            },
          ],
          text: 'Are you currently taking immunosuppressants?',
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/yesnodontknow',
          item: [
            {
              linkId: 'M1-Explanation',
              type: 'display',
              text: 'You take or get immunosuppressants after an organ transplant, during therapy for an autoimmune disease, or during chemotherapy.',
            },
          ],
          answerOption: [
            {
              valueString: 'Yes',
              id: 'id-1100',
            },
            {
              valueString: 'No',
              id: 'id-1101',
            },
            {
              valueString: "Don't know",
              id: 'id-1102',
            },
          ],
        },
        {
          type: 'choice',
          required: true,
          linkId: 'M2',
          code: [
            {
              code: 'recent-influenza-vaccine',
              display: 'Influenza vaccine for the current influenza season',
              system: 'http://fhir.data4life.care/covid-19/r4/CodeSystem/medication-questions',
            },
          ],
          text: 'Have you been vaccinated against flu between August 1, 2020 and today?',
          answerValueSet: 'http://fhir.data4life.care/covid-19/r4/ValueSet/yesno',
          answerOption: [
            {
              valueString: 'Yes',
              id: 'id-1200',
            },
            {
              valueString: 'No',
              id: 'id-1201',
            },
          ],
        },
      ],
    },
  ],
  language: 'en',
  title: 'COVID-19 Assessment Questionnaire',
  id: 'covid19-assessment',
};

export const Covid19NasalSpecimen: SpecimenDefinition = {
  resourceType: 'SpecimenDefinition',
  id: 'covid19-nasal-specimen',
  typeCollected: {
    coding: [{ system: SNOMED, code: '871810001', display: 'Mid-turbinate nasal swab' }],
  },
};

export const Covid19PCRObservationDefinition: ObservationDefinition = {
  resourceType: 'ObservationDefinition',
  id: 'covid19pcr-observation-definition',
  preferredReportName: 'SARS-CoV-2 (COVID-19) RNA [Presence] in Respiratory specimen by NAA with probe detection',
  code: {
    coding: [
      {
        code: '94500-6',
        system: LOINC,
        display: 'SARS-CoV-2 (COVID-19) RNA [Presence] in Respiratory specimen by NAA with probe detection',
      },
    ],
  },
  permittedDataType: ['string'],
};

export const Covid19PCRTest: ActivityDefinition = {
  resourceType: 'ActivityDefinition',
  id: 'covid19-pcr-test',
  status: 'active',
  kind: 'ServiceRequest',
  title: 'Order SARS-CoV-2 (COVID-19) RNA panel',
  name: 'Order SARS-CoV-2 (COVID-19) RNA panel',
  description:
    'Order SARS-CoV-2 (COVID-19) RNA panel - Respiratory specimen by NAA with probe detection (Loinc: 94531-1)',
  code: {
    coding: [
      {
        system: LOINC,
        code: '94531-1',
        display: 'SARS-CoV-2 (COVID-19) RNA panel - Respiratory specimen by NAA with probe detection',
      },
    ],
  },

  specimenRequirement: [createReference(Covid19NasalSpecimen)],
  observationResultRequirement: [createReference(Covid19PCRObservationDefinition)],
};

export const Covid19ReviewReport: ActivityDefinition = {
  resourceType: 'ActivityDefinition',
  title: 'Review COVID-19 Report',
  name: 'Review COVID-19 Report',
  description: 'Review COVID-19 PCR diagnostic results',
  id: 'covid19-review-report',
  status: 'active',
  kind: 'Task',
  participant: [
    {
      type: 'practitioner',
    },
  ],
};

export const Covid19CarePlanDefinition: PlanDefinition = {
  resourceType: 'PlanDefinition',
  title: 'COVID-19 Evaluation Pre-Admission to Inpatient Oncology Department',
  identifier: [
    {
      system: 'foomedical.com',
      value: 'covid19-plan-def',
    },
  ],
  status: 'active',
  action: [
    {
      id: '0',
      title: 'Request COVID-19 Symptoms Assessment',
      description: 'Request patient to complete "Request COVID-19 Symptoms Assessment" questionnaire',
      definitionCanonical: getReferenceString(Covid19AssessmentQuestionnaire),
      timingDateTime: '2022-01-01',
    },
    {
      id: '1',
      title: 'Initial Patient Consultation',
      description: 'Schedule initial patient consultation',
      definitionCanonical: getReferenceString(DrAliceSmithSchedule),
      timingDateTime: '2022-01-02',
    },
    {
      id: '2',
      title: 'Order SARS-CoV-2 (COVID-19) RNA panel',
      description:
        'Order SARS-CoV-2 (COVID-19) RNA panel - Respiratory specimen by NAA with probe detection (Loinc: 94531-1)',
      definitionCanonical: getReferenceString(Covid19PCRTest),
      timingDateTime: '2022-01-04',
    },
    {
      id: '3',
      title: 'Review COVID-19 Report',
      description: 'Review COVID-19 PCR diagnostic results',
      definitionCanonical: getReferenceString(Covid19ReviewReport),
      timingDateTime: '2022-01-05',
    },
    {
      id: '4',
      title: 'Patient Follow Up: Patient admission appointment with specialist',
      description: 'Schedule patient follow-up call to review diagnostic results',
      definitionCanonical: getReferenceString(DrAliceSmithSchedule),
      timingDateTime: '2022-01-06',
    },
  ],
  id: 'covid19-care-plan-definition',
};

export const Covid19PCRLabService: PlanDefinition = {
  resourceType: 'PlanDefinition',
  title: 'SARS-CoV-2 (COVID-19) RNA panel',
  description: 'SARS-CoV-2 (COVID-19) RNA panel - Respiratory specimen by NAA with probe detection (Loinc: 94531-1)',
  type: {
    coding: [
      {
        system: 'http://hl7.org/fhir/uv/order-catalog/CodeSystem/laboratory-service-definition-type',
        code: 'test',
        display: 'Unitary measurement performed on an in vitro biologic specimen',
      },
    ],
  },
  identifier: [
    {
      system: 'foomedical.com',
      value: 'covid19-pcr-lab',
    },
  ],
  status: 'active',
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
  action: [
    {
      id: '0',
      title: 'SARS-CoV-2 (COVID-19) RNA panel',
      description:
        'SARS-CoV-2 (COVID-19) RNA panel - Respiratory specimen by NAA with probe detection (Loinc: 94531-1)',
      definitionCanonical: getReferenceString(Covid19PCRTest),
      timingDateTime: '2022-01-04',

      code: [
        {
          coding: [
            {
              system: LOINC,
              code: '94531-1',
              display: 'SARS-CoV-2 (COVID-19) RNA panel - Respiratory specimen by NAA with probe detection',
            },
          ],
        },
      ],
    },
  ],
  id: 'covid19-care-plan-definition',
};

export const Covid19AssessmentTask: Task = {
  meta: { author: createReference(DrAliceSmith) },
  resourceType: 'Task',

  focus: {
    reference: getReferenceString(Covid19AssessmentQuestionnaire),
    display: 'Covid19 Assessment Questionnaire',
  },
  description: 'Request patient to complete "Request COVID-19 Symptoms Assessment" questionnaire',
  intent: 'order',
  status: 'completed',
  for: createReference(HomerSimpson),
  requester: createReference(DrAliceSmith),
  id: 'covid19-assessment-task',
};

export const Covid19InitialConsultTask: Task = {
  meta: { author: createReference(DrAliceSmith) },
  resourceType: 'Task',
  focus: {
    reference: 'Appointment/e60dfe9c-2252-47aa-bf12-305b40daf370',
  },
  description: 'Schedule initial patient consultation',
  intent: 'order',
  status: 'completed',
  for: createReference(HomerSimpson),
  requester: createReference(DrAliceSmith),
  id: 'covid19-initial-consult-task',
};

export const Covid19PCRServiceRequest: ServiceRequest = {
  // Required fields
  resourceType: 'ServiceRequest',
  id: 'covid19pcr-service-request',
  status: 'active',
  intent: 'order',
  subject: createReference(HomerSimpson),

  // Code
  code: {
    coding: [
      {
        system: LOINC,
        code: '94531-1',
        display: 'SARS-CoV-2 (COVID-19) RNA panel - Respiratory specimen by NAA with probe detection',
      },
    ],
  },
};

export const Covid19PCRTask: Task = {
  meta: { author: createReference(DrAliceSmith) },
  resourceType: 'Task',

  description: 'Order COVID-19 PCR Panel (Loinc: 94531-1)',
  intent: 'order',
  status: 'completed',
  for: createReference(HomerSimpson),
  focus: createReference(Covid19PCRServiceRequest),
  requester: createReference(DrAliceSmith),
  id: 'covid19pcr-task',
};

export const Covid19ReviewLabsTask: Task = {
  meta: { author: createReference(DrAliceSmith) },
  resourceType: 'Task',
  focus: createReference(HomerDiagnosticReport),
  description: 'Review COVID-19 PCR diagnostic results',
  intent: 'order',
  status: 'in-progress',
  for: createReference(HomerSimpson),
  requester: createReference(DrAliceSmith),
  id: 'covid19-review-labs-task',
};

export const Covid19FollowUpConsultTask: Task = {
  meta: { author: createReference(DrAliceSmith) },
  resourceType: 'Task',
  focus: createReference(DrAliceSmithSchedule),
  description: 'Schedule patient follow-up call to review diagnostic results',
  intent: 'order',
  status: 'on-hold',
  for: createReference(HomerSimpson),
  requester: createReference(DrAliceSmith),
  id: 'covid19-follow-up-consult-task',
};

export const Covid19RequestGroup: RequestGroup = {
  resourceType: 'RequestGroup',
  status: 'active',
  intent: 'order',
  instantiatesCanonical: [getReferenceString(Covid19CarePlanDefinition)],
  identifier: [
    {
      system: 'foomedical.com',
      value: 'requestGroup-patient-female-2',
    },
  ],
  subject: createReference(HomerSimpson),
  action: [
    {
      id: 'action-1',
      resource: createReference(Covid19AssessmentTask),
      title: 'COVID-19 Symptoms Assessment',
    },
    {
      id: 'action-0',
      resource: createReference(Covid19InitialConsultTask),
      title: 'Initial Patient Consultation',
    },

    {
      id: 'action-2',
      resource: createReference(Covid19PCRTask),
      title: 'Order COVID-19 PCR Test',
    },
    {
      id: 'action-3',
      resource: createReference(Covid19ReviewLabsTask),
      title: 'Review COVID-19 Report',
    },
    {
      id: 'action-4',
      resource: createReference(Covid19FollowUpConsultTask),
      title: 'Patient Follow Up: Patient admission appointment with specialist',
    },
  ],
  id: 'covid19-request-group',
  code: {
    text: 'COVID 19 Assessment',
  },
};
