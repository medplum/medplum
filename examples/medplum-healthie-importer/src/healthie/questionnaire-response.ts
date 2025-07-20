import { QuestionnaireResponse, Reference, Patient } from '@medplum/fhirtypes';
import { HealthieClient } from './client';
import { HEALTHIE_FORM_ANSWER_GROUP_ID_SYSTEM } from './constants';

// TypeScript interfaces for Healthie API structures
export interface HealthieFormAnswerGroup {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  finished?: boolean;
  form_answers: HealthieFormAnswer[];
}

export interface HealthieFormAnswer {
  label: string;
  displayed_answer: string;
  answer: string;
  id: string;
  custom_module: HealthieCustomModule;
}

export interface HealthieCustomModule {
  id: string;
  mod_type: string;
  label: string;
  required?: boolean;
}

// GraphQL query for fetching form answer groups
const GET_FORM_ANSWER_GROUPS_QUERY = `
  query formAnswerGroups($userId: ID!) {
    formAnswerGroups(user_id: $userId, finished: true) {
      id
      user_id
      name
      created_at
      finished
      form_answers {
        label
        displayed_answer
        answer
        id
        custom_module {
          id
          mod_type
          label
          required
        }
      }
    }
  }
`;

/**
 * Fetches Healthie FormAnswerGroups for a patient from the API
 * @param patientId - The Healthie patient ID
 * @param healthieClient - The Healthie API client
 * @returns Array of Healthie FormAnswerGroup objects
 */
export async function fetchHealthieFormAnswerGroups(
  patientId: string,
  healthieClient: HealthieClient
): Promise<HealthieFormAnswerGroup[]> {
  const result = await healthieClient.query<{ formAnswerGroups: HealthieFormAnswerGroup[] }>(
    GET_FORM_ANSWER_GROUPS_QUERY,
    { userId: patientId }
  );

  return result.formAnswerGroups;
}

/**
 * Converts a Healthie FormAnswerGroup to a FHIR QuestionnaireResponse
 * @param formAnswerGroup - The Healthie FormAnswerGroup
 * @param healthieApiUrl - The base URL for Healthie API (for canonical references)
 * @param patientReference - The reference to the patient
 * @returns FHIR QuestionnaireResponse resource
 */
export function convertHealthieFormAnswerGroupToFhir(
  formAnswerGroup: HealthieFormAnswerGroup,
  healthieApiUrl: string,
  patientReference: Reference<Patient>
): QuestionnaireResponse {
  // Group answers by custom_module.id to handle multiple answers for the same question
  const answerGroups = new Map<string, HealthieFormAnswer[]>();

  formAnswerGroup.form_answers
    .filter((answer) => answer.answer && answer.answer.trim() !== '') // Filter out empty answers
    .forEach((answer) => {
      const moduleId = answer.custom_module.id;
      if (!answerGroups.has(moduleId)) {
        answerGroups.set(moduleId, []);
      }
      const moduleAnswers = answerGroups.get(moduleId);
      if (moduleAnswers) {
        moduleAnswers.push(answer);
      }
    });

  // Convert each group to FHIR items
  const items: NonNullable<QuestionnaireResponse['item']> = [];

  for (const [, answers] of answerGroups) {
    const item = convertHealthieAnswerGroupToFhirItem(answers);
    if (item) {
      items.push(item);
    }
  }

  return {
    resourceType: 'QuestionnaireResponse',
    id: formAnswerGroup.id,
    identifier: { system: HEALTHIE_FORM_ANSWER_GROUP_ID_SYSTEM, value: formAnswerGroup.id },
    questionnaire: `${healthieApiUrl}/Questionnaire/healthie-${createSlug(formAnswerGroup.name)}`,
    status: formAnswerGroup.finished ? 'completed' : 'in-progress',
    subject: patientReference,
    authored: convertHealthieTimestampToIso(formAnswerGroup.created_at),
    item: items,
  };
}

/**
 * Creates a URL-friendly slug from a string
 * @param text - The text to slugify
 * @returns URL-friendly slug
 */
export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .trim();
}

/**
 * Converts a Healthie timestamp to ISO format
 * Healthie format: "YYYY-MM-DD HH:mm:ss -HHMM" (e.g., "2025-07-19 10:48:32 -0700")
 * ISO format: "YYYY-MM-DDTHH:mm:ss.sssZ" or "YYYY-MM-DDTHH:mm:ss±HH:MM"
 * @param healthieTimestamp - The timestamp from Healthie
 * @returns ISO formatted timestamp
 */
export function convertHealthieTimestampToIso(healthieTimestamp: string): string {
  // Healthie format: "2025-07-19 10:48:32 -0700"
  // We need to convert to: "2025-07-19T10:48:32-07:00"

  // Split the timestamp into date/time part and timezone part
  const parts = healthieTimestamp.trim().split(' ');
  if (parts.length !== 3) {
    // Fallback: if format is unexpected, return as-is
    return healthieTimestamp;
  }

  const datePart = parts[0]; // "2025-07-19"
  const timePart = parts[1]; // "10:48:32"
  const timezonePart = parts[2]; // "-0700"

  // Format timezone from "-0700" to "-07:00"
  let formattedTimezone = timezonePart;
  if (timezonePart.length === 5 && (timezonePart.startsWith('+') || timezonePart.startsWith('-'))) {
    const sign = timezonePart[0];
    const hours = timezonePart.slice(1, 3);
    const minutes = timezonePart.slice(3, 5);
    formattedTimezone = `${sign}${hours}:${minutes}`;
  }

  // Combine into ISO format
  return `${datePart}T${timePart}${formattedTimezone}`;
}

/**
 * Converts a group of Healthie FormAnswers (for the same question) to a FHIR QuestionnaireResponse item
 * @param answers - The group of Healthie FormAnswers for the same question
 * @returns FHIR QuestionnaireResponse item or null if should be filtered out
 */
function convertHealthieAnswerGroupToFhirItem(
  answers: HealthieFormAnswer[]
): NonNullable<QuestionnaireResponse['item']>[0] | null {
  if (answers.length === 0) {
    return null;
  }

  const firstAnswer = answers[0];
  const { custom_module } = firstAnswer;

  // Filter out display-only fields
  if (['label', 'read_only', 'hipaa'].includes(custom_module.mod_type)) {
    return null;
  }

  // Handle matrix questions (TODO: implement parsing)
  if (custom_module.mod_type === 'matrix') {
    // TODO: Parse matrix answer and create sub-items
    return null;
  }

  const item: NonNullable<QuestionnaireResponse['item']>[0] = {
    linkId: custom_module.id,
    text: custom_module.label,
    answer: [],
  };

  // Convert each answer in the group
  for (const answer of answers) {
    const fhirAnswer = convertHealthieAnswerValueToFhir(answer);
    if (fhirAnswer && item.answer) {
      item.answer.push(fhirAnswer);
    }
  }

  return item.answer && item.answer.length > 0 ? item : null;
}

/**
 * Converts a single Healthie FormAnswer value to a FHIR answer value
 * @param answer - The Healthie FormAnswer
 * @returns FHIR answer value or null
 */
function convertHealthieAnswerValueToFhir(
  answer: HealthieFormAnswer
): NonNullable<NonNullable<QuestionnaireResponse['item']>[0]['answer']>[0] | null {
  const { custom_module, answer: answerValue } = answer;

  switch (custom_module.mod_type) {
    case 'radio':
    case 'text':
    case 'textarea':
    case 'name':
    case 'checkbox':
      return { valueString: answerValue };

    case 'agree_to_above':
      return {
        valueBoolean:
          answerValue.toLowerCase() === 'true' || answerValue.toLowerCase() === 'yes' || answerValue.includes('agree'),
      };

    case 'date':
    case 'dob':
      return { valueDate: answerValue };

    case 'signature': {
      // TODO: Use FHIR SDC extension for signatures
      const base64Data = answerValue.includes(',') ? answerValue.split(',')[1] : answerValue;
      return {
        valueAttachment: {
          contentType: 'image/png',
          data: base64Data,
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Parses a matrix answer JSON string and converts to FHIR sub-items
 * @param matrixAnswer - The JSON string containing matrix data
 * @param _linkId - The parent question's linkId
 * @returns Array of FHIR QuestionnaireResponse items
 */
function _parseMatrixAnswer(
  matrixAnswer: string,
  _linkId: string
): NonNullable<QuestionnaireResponse['item']>[0]['item'] {
  // TODO: Implement matrix parsing logic
  // The matrix format appears to be a JSON string containing nested arrays
  // Each row represents a question-answer pair within the matrix
  try {
    const matrixData = JSON.parse(matrixAnswer);
    // Implementation will depend on the exact structure of the matrix data
    console.log('Matrix data to be parsed:', matrixData);
    return undefined;
  } catch (error) {
    console.warn('Failed to parse matrix answer:', error);
    return undefined;
  }
}
