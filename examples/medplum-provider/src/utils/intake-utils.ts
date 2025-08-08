// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  addProfileToResource,
  createReference,
  getReferenceString,
  HTTP_HL7_ORG,
  HTTP_TERMINOLOGY_HL7_ORG,
  LOINC,
  MedplumClient,
  SNOMED,
} from '@medplum/core';
import {
  Address,
  CodeableConcept,
  Coding,
  Consent,
  HumanName,
  Observation,
  Organization,
  Patient,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';

export const PROFILE_URLS: Record<string, string> = {
  AllergyIntolerance: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-allergyintolerance`,
  CareTeam: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-careteam`,
  Coverage: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-coverage`,
  Immunization: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-immunization`,
  MedicationRequest: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-medicationrequest`,
  Patient: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`,
  ObservationSexualOrientation: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-observation-sexual-orientation`,
  ObservationSmokingStatus: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-smokingstatus`,
};

export const extensionURLMapping: Record<string, string> = {
  race: HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-race',
  ethnicity: HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-ethnicity',
  veteran: HTTP_HL7_ORG + '/fhir/us/military-service/StructureDefinition/military-service-veteran-status',
};

export const observationCodeMapping: Record<string, CodeableConcept> = {
  housingStatus: { coding: [{ code: '71802-3', system: LOINC, display: 'Housing status' }] },
  educationLevel: { coding: [{ code: '82589-3', system: LOINC, display: 'Highest Level of Education' }] },
  smokingStatus: { coding: [{ code: '72166-2', system: LOINC, display: 'Tobacco smoking status' }] },
  sexualOrientation: { coding: [{ code: '76690-7', system: LOINC, display: 'Sexual orientation' }] },
  pregnancyStatus: { coding: [{ code: '82810-3', system: LOINC, display: 'Pregnancy status' }] },
  estimatedDeliveryDate: { coding: [{ code: '11778-8', system: LOINC, display: 'Estimated date of delivery' }] },
};

export const observationCategoryMapping: Record<string, CodeableConcept> = {
  socialHistory: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/observation-category',
        code: 'social-history',
        display: 'Social History',
      },
    ],
  },
  sdoh: {
    coding: [
      {
        system: HTTP_HL7_ORG + '/fhir/us/core/CodeSystem/us-core-tags',
        code: 'sdoh',
        display: 'SDOH',
      },
    ],
  },
};

export const consentScopeMapping: Record<string, CodeableConcept> = {
  adr: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentscope',
        code: 'adr',
        display: 'Advanced Care Directive',
      },
    ],
  },
  patientPrivacy: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentscope',
        code: 'patient-privacy',
        display: 'Patient Privacy',
      },
    ],
  },
  treatment: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentscope',
        code: 'treatment',
        display: 'Treatment',
      },
    ],
  },
};

export const consentCategoryMapping: Record<string, CodeableConcept> = {
  acd: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentcategorycodes',
        code: 'acd',
        display: 'Advanced Care Directive',
      },
    ],
  },
  nopp: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/v3-ActCode',
        code: 'nopp',
        display: 'Notice of Privacy Practices',
      },
    ],
  },
  pay: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/v3-ActCode',
        code: 'pay',
        display: 'Payment',
      },
    ],
  },
  med: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/v3-ActCode',
        code: 'med',
        display: 'Medical',
      },
    ],
  },
};

export const consentPolicyRuleMapping: Record<string, CodeableConcept> = {
  hipaaNpp: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentpolicycodes',
        code: 'hipaa-npp',
        display: 'HIPAA Notice of Privacy Practices',
      },
    ],
  },
  hipaaSelfPay: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentpolicycodes',
        code: 'hipaa-self-pay',
        display: 'HIPAA Self-Pay Restriction',
      },
    ],
  },
  cric: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentpolicycodes',
        code: 'cric',
        display: 'Common Rule Informed Consent',
      },
    ],
  },
  adr: {
    coding: [
      {
        system: 'http://medplum.com',
        code: 'BasicADR',
        display: 'Advanced Care Directive',
      },
    ],
  },
};

type ObservationQuestionnaireItemType = 'valueCodeableConcept' | 'valueDateTime';

/**
 * This function takes data about an Observation and creates or updates an existing
 * resource with the same patient and code.
 *
 * @param medplum - A Medplum client
 * @param patient - A Patient resource that will be stored as the subject
 * @param code - A code for the observation
 * @param category - A category for the observation
 * @param answerType - The value[x] field where the answer should be stored
 * @param value - The value to be stored in the observation
 * @param profileUrl - An optional profile URL to be added to the resource
 */
export async function upsertObservation(
  medplum: MedplumClient,
  patient: Patient,
  code: CodeableConcept,
  category: CodeableConcept,
  answerType: ObservationQuestionnaireItemType,
  value: QuestionnaireResponseItemAnswer | undefined,
  profileUrl?: string
): Promise<void> {
  if (!value || !code) {
    return;
  }

  let observation: Observation = {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    code: code,
    category: [category],
    effectiveDateTime: new Date().toISOString(),
  };

  if (profileUrl) {
    observation = addProfileToResource(observation, profileUrl);
  }

  if (answerType === 'valueCodeableConcept') {
    observation.valueCodeableConcept = {
      coding: [value],
    };
  } else if (answerType === 'valueDateTime') {
    observation.valueDateTime = value.valueDateTime;
  }

  const coding = code.coding?.[0] as Coding;
  await medplum.upsertResource(observation, {
    code: `${coding.system}|${coding.code}`,
    subject: getReferenceString(patient),
  });
}

type ExtensionQuestionnaireItemType = 'valueCoding' | 'valueBoolean';

/**
 * Add an extension to a patient
 *
 * @param patient - A patient resource
 * @param url - An URL that identifies the extension
 * @param answerType - The value[x] field where the answer should be stored
 * @param answer - The value to be stored in the extension
 * @param subExtensionKey - A key to identify a sub-extension
 */
export function addExtension(
  patient: Patient,
  url: string,
  answerType: ExtensionQuestionnaireItemType,
  answer: QuestionnaireResponseItemAnswer | undefined,
  subExtensionKey?: string
): void {
  let value = answer?.[answerType];

  // Answer to boolean Questionnaire fields will be set as `undefined` if the check mark is not ticked
  // so in this case we should interpret it as `false`.
  if (answerType === 'valueBoolean') {
    value = Boolean(value);
  }

  if (value === undefined) {
    return;
  }

  patient.extension ||= [];

  if (subExtensionKey) {
    const subExtensions = [
      {
        url: subExtensionKey,
        [answerType]: value,
      },
    ];
    if (answerType === 'valueCoding' && (value as Coding).display) {
      subExtensions.push({ url: 'text', valueString: (value as Coding).display as string });
    }
    patient.extension.push({
      url,
      extension: subExtensions,
    });
  } else {
    patient.extension.push({
      url,
      [answerType]: value,
    });
  }
}

/**
 * Add a language to patient's communication attribute or set an existing one as preferred
 *
 * @param patient - The patient
 * @param valueCoding - A Coding with the language data
 * @param preferred - Whether this language should be set as preferred
 */
export function addLanguage(patient: Patient, valueCoding: Coding | undefined, preferred: boolean = false): void {
  if (!valueCoding) {
    return;
  }

  const patientCommunications = patient.communication ?? [];

  // Checks if the patient already has the language in their list of communications
  let language = patientCommunications.find(
    (communication) => communication.language.coding?.[0].code === valueCoding?.code
  );

  // Add the language in case it's not set yet
  if (!language) {
    language = {
      language: {
        coding: [valueCoding],
      },
    };
    patientCommunications.push(language);
  }

  if (preferred) {
    language.preferred = preferred;
  }

  patient.communication = patientCommunications;
}

/**
 * Adds an AllergyIntolerance resource
 *
 * @param medplum - The Medplum client
 * @param patient - The patient beneficiary of the allergy
 * @param answers - A list of objects where the keys are the linkIds of the fields used to set up an
 */
export async function addAllergy(
  medplum: MedplumClient,
  patient: Patient,
  answers: Record<string, QuestionnaireResponseItemAnswer>
): Promise<void> {
  const code = answers['allergy-substance']?.valueCoding;

  if (!code) {
    return;
  }

  const reaction = answers['allergy-reaction']?.valueString;
  const onsetDateTime = answers['allergy-onset']?.valueDateTime;

  await medplum.upsertResource(
    {
      resourceType: 'AllergyIntolerance',
      meta: {
        profile: [PROFILE_URLS.AllergyIntolerance],
      },
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
        text: 'Unconfirmed',
        coding: [
          {
            system: 'http://hl7.org/fhir/ValueSet/allergyintolerance-verification',
            code: 'unconfirmed',
            display: 'Unconfirmed',
          },
        ],
      },
      patient: createReference(patient),
      code: { coding: [code] },
      reaction: reaction ? [{ manifestation: [{ text: reaction }] }] : undefined,
      onsetDateTime: onsetDateTime,
    },
    {
      patient: getReferenceString(patient),
      code: `${code.system}|${code.code}`,
    }
  );
}

/**
 * Adds a MedicationRequest resource
 *
 * @param medplum - The Medplum client
 * @param patient - The patient beneficiary of the medication
 * @param answers - A list of objects where the keys are the linkIds of the fields used to set up a
 *                 medication (see getGroupRepeatedAnswers)
 */
export async function addMedication(
  medplum: MedplumClient,
  patient: Patient,
  answers: Record<string, QuestionnaireResponseItemAnswer>
): Promise<void> {
  const code = answers['medication-code']?.valueCoding;

  if (!code) {
    return;
  }

  const note = answers['medication-note']?.valueString;

  await medplum.upsertResource(
    {
      resourceType: 'MedicationRequest',
      meta: {
        profile: [PROFILE_URLS.MedicationRequest],
      },
      subject: createReference(patient),
      status: 'active',
      intent: 'order',
      requester: createReference(patient),
      medicationCodeableConcept: { coding: [code] },
      note: note ? [{ text: note }] : undefined,
    },
    {
      subject: getReferenceString(patient),
      code: `${code.system}|${code.code}`,
    }
  );
}

/**
 * Adds a Condition resource
 *
 * @param medplum - The Medplum client
 * @param patient - The patient beneficiary of the condition
 * @param answers - A list of objects where the keys are the linkIds of the fields used to set up a
 *                 condition (see getGroupRepeatedAnswers)
 */
export async function addCondition(
  medplum: MedplumClient,
  patient: Patient,
  answers: Record<string, QuestionnaireResponseItemAnswer>
): Promise<void> {
  const code = answers['medical-history-problem']?.valueCoding;

  if (!code) {
    return;
  }

  const clinicalStatus = answers['medical-history-clinical-status']?.valueCoding;
  const onsetDateTime = answers['medical-history-onset']?.valueDateTime;

  await medplum.upsertResource(
    {
      resourceType: 'Condition',
      subject: createReference(patient),
      code: { coding: [code] },
      clinicalStatus: clinicalStatus ? { coding: [clinicalStatus] } : undefined,
      onsetDateTime: onsetDateTime,
    },
    {
      subject: getReferenceString(patient),
      code: `${code?.system}|${code?.code}`,
    }
  );
}

/**
 * Adds a FamilyMemberHistory resource
 *
 * @param medplum - The Medplum client
 * @param patient - The patient beneficiary of the family member history
 * @param answers - A list of objects where the keys are the linkIds of the fields used to set up a
 *                 family member history (see getGroupRepeatedAnswers)
 */
export async function addFamilyMemberHistory(
  medplum: MedplumClient,
  patient: Patient,
  answers: Record<string, QuestionnaireResponseItemAnswer>
): Promise<void> {
  const condition = answers['family-member-history-problem']?.valueCoding;
  const relationship = answers['family-member-history-relationship']?.valueCoding;

  if (!condition || !relationship) {
    return;
  }

  const deceased = answers['family-member-history-deceased']?.valueBoolean;

  await medplum.upsertResource(
    {
      resourceType: 'FamilyMemberHistory',
      patient: createReference(patient),
      status: 'completed',
      relationship: { coding: [relationship] },
      condition: [{ code: { coding: [condition] } }],
      deceasedBoolean: deceased,
    },
    {
      patient: getReferenceString(patient),
      code: `${condition.system}|${condition.code}`,
      relationship: `${relationship.system}|${relationship.code}`,
    }
  );
}

/**
 *
 * @param medplum - The Medplum client
 * @param patient - The patient beneficiary of the immunization
 * @param answers - A list of objects where the keys are the linkIds of the fields used to set up an
 *                  immunization (see getGroupRepeatedAnswers)
 */
export async function addImmunization(
  medplum: MedplumClient,
  patient: Patient,
  answers: Record<string, QuestionnaireResponseItemAnswer>
): Promise<void> {
  const code = answers['immunization-vaccine']?.valueCoding;
  const occurrenceDateTime = answers['immunization-date']?.valueDateTime;

  if (!code || !occurrenceDateTime) {
    return;
  }

  await medplum.upsertResource(
    {
      resourceType: 'Immunization',
      meta: {
        profile: [PROFILE_URLS.Immunization],
      },
      status: 'completed',
      vaccineCode: { coding: [code] },
      patient: createReference(patient),
      occurrenceDateTime: occurrenceDateTime,
    },
    {
      status: 'completed',
      'vaccine-code': `${code.system}|${code.code}`,
      patient: getReferenceString(patient),
      date: occurrenceDateTime,
    }
  );
}

/**
 * Adds a CareTeam resource associating the patient with a pharmacy
 *
 * @param medplum - The Medplum client
 * @param patient - The patient beneficiary of the care team
 * @param pharmacy - The pharmacy to be added to the care team
 */
export async function addPharmacy(
  medplum: MedplumClient,
  patient: Patient,
  pharmacy: Reference<Organization>
): Promise<void> {
  await medplum.upsertResource(
    {
      resourceType: 'CareTeam',
      meta: {
        profile: [PROFILE_URLS.CareTeam],
      },
      status: 'proposed',
      name: 'Patient Preferred Pharmacy',
      subject: createReference(patient),
      participant: [
        {
          member: pharmacy,
          role: [{ coding: [{ system: SNOMED, code: '76166008', display: 'Practical aid (pharmacy) (occupation)' }] }],
        },
      ],
    },
    {
      name: 'Patient Preferred Pharmacy',
      subject: getReferenceString(patient),
    }
  );
}

/**
 * Adds a Coverage resource
 *
 * @param medplum - The Medplum client
 * @param patient - The patient beneficiary of the coverage
 * @param answers - A list of objects where the keys are the linkIds of the fields used to set up a
 *                  coverage (see getGroupRepeatedAnswers)
 */
export async function addCoverage(
  medplum: MedplumClient,
  patient: Patient,
  answers: Record<string, QuestionnaireResponseItemAnswer>
): Promise<void> {
  const payor = answers['insurance-provider'].valueReference as Reference<Organization>;
  const subscriberId = answers['subscriber-id'].valueString;
  const relationshipToSubscriber = answers['relationship-to-subscriber'].valueCoding as Coding;

  // Create RelatedPerson resource depending on the relationship to the subscriber
  const relatedPersonAnswers = answers['related-person'] as Record<string, QuestionnaireResponseItemAnswer>;
  if (
    relationshipToSubscriber.code &&
    !['other', 'self', 'injured'].includes(relationshipToSubscriber.code) &&
    relatedPersonAnswers
  ) {
    const name = getHumanName(relatedPersonAnswers, 'related-person-');
    const relatedPersonRelationship = getRelatedPersonRelationshipFromCoverage(relationshipToSubscriber);

    await medplum.createResource({
      resourceType: 'RelatedPerson',
      patient: createReference(patient),
      relationship: relatedPersonRelationship ? [{ coding: [relatedPersonRelationship] }] : undefined,
      name: name ? [name] : undefined,
      birthDate: relatedPersonAnswers['related-person-dob']?.valueDate,
      gender:
        (relatedPersonAnswers['related-person-gender-identity']?.valueCoding?.code as Patient['gender']) ?? undefined,
    });
  }

  await medplum.upsertResource(
    {
      resourceType: 'Coverage',
      meta: {
        profile: [PROFILE_URLS.Coverage],
      },
      status: 'active',
      beneficiary: createReference(patient),
      subscriberId: subscriberId,
      relationship: { coding: [relationshipToSubscriber] },
      payor: [payor],
    },
    {
      beneficiary: getReferenceString(patient),
      payor: getReferenceString(payor),
    }
  );
}

export async function addConsent(
  medplum: MedplumClient,
  patient: Patient,
  consentGiven: boolean,
  scope: CodeableConcept,
  category: CodeableConcept,
  policyRule: CodeableConcept | undefined,
  date: Consent['dateTime'] | undefined
): Promise<void> {
  await medplum.createResource({
    resourceType: 'Consent',
    patient: createReference(patient),
    status: consentGiven ? 'active' : 'rejected',
    scope: scope,
    category: [category],
    policyRule: policyRule,
    dateTime: date,
  });
}

/**
 * Finds a QuestionnaireItem or QuestionnaireResponseItem with the given linkId
 *
 * @param items - The array of objects present in the `.item` attribute of a Questionnaire or QuestionnaireResponse
 * @param linkId - The id to be found
 * @returns - The found item or undefined in case it's not found
 */
export function findQuestionnaireItem<T extends QuestionnaireItem | QuestionnaireResponseItem>(
  items: T[] | undefined,
  linkId: string
): T | undefined {
  if (!items) {
    return undefined;
  }

  return items.reduce((foundItem: T | undefined, currentItem: T | undefined) => {
    // If currentItem is undefined or the item was already found just return it
    if (foundItem || !currentItem) {
      return foundItem;
    }

    if (currentItem.linkId === linkId) {
      return currentItem;
    } else if (currentItem.item) {
      // This enables traversing nested structures
      return findQuestionnaireItem(currentItem.item as T[], linkId);
    }

    return undefined;
  }, undefined);
}

/**
 * Finds the answers to a group of items that can be repeated.
 *
 * @param questionnaire - The Questionnaire resource, used to find the list of linkIds that will compose each group
 * @param response - The QuestionnaireResponse resource where the answers will be extracted
 * @param groupLinkId - The linkId of the group that can be repeated in the questionnaire
 * @returns - An array of objects each containing a set of grouped answers
 */
export function getGroupRepeatedAnswers(
  questionnaire: Questionnaire,
  response: QuestionnaireResponse,
  groupLinkId: string
): Record<string, QuestionnaireResponseItemAnswer>[] {
  // Find the questionnaire item based on groupLinkId
  const questionnaireItem = findQuestionnaireItem(questionnaire.item, groupLinkId) as QuestionnaireItem;

  if (questionnaireItem.type !== 'group' || !questionnaireItem?.item) {
    return [];
  }

  // Get all response items corresponding to the groupLinkId
  const responseGroups = response.item?.filter((item) => item.linkId === groupLinkId);

  if (!responseGroups || responseGroups?.length === 0) {
    return [];
  }

  // It expects that responses will be organized in separate groups with the same groupLinkId. Eg.:
  // [
  //   {group-linkId-1: [{answer-with-linkId-1}, {answer-with-linkId-2}, {answer-with-linkId-3}]},
  //   {group-linkId-1: [{answer-with-linkId-1}, {answer-with-linkId-2}, {answer-with-linkId-3}]}
  // ]
  // This function handles scenarios where each group can have some fields filled and some not, while keeping the order intact. Eg.:
  // [
  //   {group-linkId-1: [{answer-with-linkId-1}, {answer-with-linkId-3}]},
  //   {group-linkId-1: [{answer-with-linkId-1}, {answer-with-linkId-2}, {answer-with-linkId-3}]}
  // ]

  const groupAnswers = responseGroups.map((responseItem) => {
    const answers: Record<string, any> = {};

    const extractAnswers = (items: QuestionnaireResponseItem[]): void => {
      items.forEach(({ linkId, answer, item }) => {
        if (item) {
          const subGroupAnswers: Record<string, any> = {};
          item.forEach((subItem) => {
            if (subItem.answer) {
              subGroupAnswers[subItem.linkId] = subItem.answer?.[0] ?? {};
            }
          });
          answers[linkId] = subGroupAnswers;
        } else {
          answers[linkId] = answer?.[0] ?? {};
        }
      });
    };

    extractAnswers(responseItem.item || []);
    return answers;
  });

  return groupAnswers;
}

export function convertDateToDateTime(date: string | undefined): string | undefined {
  if (!date) {
    return undefined;
  }
  return new Date(date).toISOString();
}

export function getHumanName(
  answers: Record<string, QuestionnaireResponseItemAnswer>,
  prefix: string = ''
): HumanName | undefined {
  const patientName: HumanName = {};

  const givenName = [];
  if (answers[`${prefix}first-name`]?.valueString) {
    givenName.push(answers[`${prefix}first-name`].valueString as string);
  }
  if (answers[`${prefix}middle-name`]?.valueString) {
    givenName.push(answers[`${prefix}middle-name`].valueString as string);
  }

  if (givenName.length > 0) {
    patientName.given = givenName;
  }

  if (answers[`${prefix}last-name`]?.valueString) {
    patientName.family = answers[`${prefix}last-name`].valueString;
  }

  return Object.keys(patientName).length > 0 ? patientName : undefined;
}

export function getPatientAddress(answers: Record<string, QuestionnaireResponseItemAnswer>): Address | undefined {
  const patientAddress: Address = {};

  if (answers['street']?.valueString) {
    patientAddress.line = [answers['street'].valueString];
  }

  if (answers['city']?.valueString) {
    patientAddress.city = answers['city'].valueString;
  }

  if (answers['state']?.valueCoding?.code) {
    patientAddress.state = answers['state'].valueCoding.code;
  }

  if (answers['zip']?.valueString) {
    patientAddress.postalCode = answers['zip'].valueString;
  }

  // To simplify the demo, we're assuming the address is always a home address
  return Object.keys(patientAddress).length > 0 ? { use: 'home', type: 'physical', ...patientAddress } : undefined;
}

function getRelatedPersonRelationshipFromCoverage(coverageRelationship: Coding): Coding | undefined {
  // Basic relationship mapping between Coverage and RelatedPerson
  // Coverage.relationship: http://hl7.org/fhir/ValueSet/subscriber-relationship
  // RelatedPerson.relationship: http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype
  switch (coverageRelationship.code) {
    case 'child':
      return {
        system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
        code: 'PRN',
        display: 'parent',
      };
    case 'parent':
      return { system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'CHILD', display: 'child' };
    case 'spouse':
    case 'common':
      return { system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'SPS', display: 'spouse' };
    default:
      return undefined;
  }
}
