// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Patient,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';
import type { HealthieClient } from './client';
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
  displayed_answer?: string;
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
  query formAnswerGroups($userId: String!) {
    formAnswerGroups(user_id: $userId, page_size: 100) {
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
  const items: QuestionnaireResponseItem[] = [];

  for (const [, answers] of answerGroups) {
    const item = convertHealthieAnswerGroupToFhirItem(answers);
    if (item) {
      items.push(item);
    }
  }

  return {
    resourceType: 'QuestionnaireResponse',
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
    .replaceAll(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replaceAll(/\s+/g, '-') // Replace spaces with hyphens
    .replaceAll(/-+/g, '-') // Replace multiple hyphens with single
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
 * @returns FHIR QuestionnaireResponse item or undefined if should be filtered out
 */
function convertHealthieAnswerGroupToFhirItem(answers: HealthieFormAnswer[]): QuestionnaireResponseItem | undefined {
  if (answers.length === 0) {
    return undefined;
  }

  const firstAnswer = answers[0];
  const { custom_module } = firstAnswer;

  // Filter out display-only fields
  if (['label', 'read_only', 'hipaa'].includes(custom_module.mod_type)) {
    return undefined;
  }

  // Handle matrix questions (TODO: implement parsing)
  if (custom_module.mod_type === 'matrix') {
    // Parse matrix answer and create sub-items
    const matrixItem = parseMatrixAnswer(firstAnswer.answer, custom_module.id, custom_module.label);
    return matrixItem;
  }

  const item: QuestionnaireResponseItem = {
    linkId: custom_module.id,
    text: custom_module.label,
    answer: [],
  };

  // Convert each answer in the group
  for (const answer of answers) {
    const fhirAnswers = convertHealthieAnswerValueToFhir(answer);
    if (fhirAnswers && item.answer) {
      // fhirAnswers is now an array to handle newline-separated values
      item.answer.push(...fhirAnswers);
    }
  }

  return item.answer && item.answer.length > 0 ? item : undefined;
}

/**
 * Converts a single Healthie FormAnswer value to FHIR answer values
 * Handles newline-separated multiple values (e.g., checkbox selections)
 * @param answer - The Healthie FormAnswer
 * @returns Array of FHIR answer values
 */
function convertHealthieAnswerValueToFhir(answer: HealthieFormAnswer): QuestionnaireResponseItemAnswer[] {
  const { custom_module, answer: answerValue } = answer;

  if (answerValue.trim().length === 0) {
    return [];
  }

  // Helper function to split newline-separated values
  const splitAnswerValues = (value: string): string[] => {
    return value
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v !== '');
  };

  switch (custom_module.mod_type) {
    case 'checkbox': {
      // Checkbox answers can be newline-separated for multiple selections
      const values = splitAnswerValues(answerValue);
      return values.map((value) => ({ valueString: value }));
    }

    case 'radio':
    case 'text':
    case 'textarea':
    case 'name':
      return [{ valueString: answerValue }];

    case 'agree_to_above':
      return [
        {
          valueBoolean:
            answerValue.toLowerCase() === 'true' ||
            answerValue.toLowerCase() === 'yes' ||
            answerValue.includes('agree'),
        },
      ];

    case 'date':
    case 'dob':
      return [{ valueDate: answerValue }];

    case 'time':
      return [{ valueTime: answerValue }];

    case 'number':
    case 'Body Fat %':
      return [{ valueQuantity: { value: parseFloat(answerValue) } }];

    case 'signature': {
      // TODO: Use FHIR SDC extension for signatures
      const base64Data = answerValue.includes(',') ? answerValue.split(',')[1] : answerValue;
      return [
        {
          valueAttachment: {
            contentType: 'image/png',
            data: base64Data,
          },
        },
      ];
    }

    default:
      return [{ valueString: answerValue }];
  }
}

/**
 * Parses a matrix answer JSON string and converts to FHIR QuestionnaireResponse item
 * @param matrixAnswer - The JSON string containing matrix data
 * @param linkId - The parent question's linkId
 * @param label - The parent question's label
 * @returns FHIR QuestionnaireResponse item with sub-items
 */
function parseMatrixAnswer(matrixAnswer: string, linkId: string, label: string): QuestionnaireResponseItem | undefined {
  try {
    // Parse the outer JSON array
    const matrixData = JSON.parse(matrixAnswer) as string[][];

    if (!Array.isArray(matrixData) || matrixData.length === 0) {
      return undefined;
    }

    // First row contains column headers
    const headerRow = matrixData[0];
    const columnHeaders: string[] = [];

    // Parse each cell in the header row
    for (const cellJson of headerRow) {
      const cellData = JSON.parse(cellJson);
      columnHeaders.push(cellData.value || '');
    }

    // Create the main matrix item
    const matrixItem: QuestionnaireResponseItem = {
      linkId,
      text: label.trim() || undefined,
      item: [],
    };

    // Process data rows (skip header row)
    for (let rowIndex = 1; rowIndex < matrixData.length; rowIndex++) {
      const row = matrixData[rowIndex];
      if (!Array.isArray(row) || row.length === 0) {
        continue;
      }

      // First cell is the row name
      let rowName = '';

      const firstCellData = JSON.parse(row[0]);
      rowName = firstCellData.value?.trim() || `Row ${rowIndex}`;

      // Create a sub-item for this row
      const rowItem: QuestionnaireResponseItem = {
        linkId: `${linkId}.${rowIndex}`,
        text: rowName,
        item: [],
      };

      // Process the remaining cells in the row (skip first cell which is the row name)
      for (let colIndex = 1; colIndex < row.length && colIndex < columnHeaders.length; colIndex++) {
        const cellJson = row[colIndex];
        const columnHeader = columnHeaders[colIndex];

        if (!columnHeader) {
          continue;
        }

        try {
          const cellData = JSON.parse(cellJson);
          const cellValue = cellData.value;
          const cellType = cellData.type;

          // Only create sub-items for cells with values
          const hasValue =
            (cellValue && typeof cellValue === 'string' && cellValue.trim() !== '') || typeof cellValue === 'boolean';
          if (hasValue) {
            const cellItem = {
              linkId: `${linkId}.${rowIndex}.${colIndex}`,
              text: columnHeader,
              answer: [] as QuestionnaireResponseItemAnswer[],
            } satisfies QuestionnaireResponseItem;

            // Convert cell value based on type
            if (cellType === 'checkbox') {
              if (cellItem.answer) {
                cellItem.answer.push({ valueBoolean: cellValue as boolean });
              }
            } else {
              cellItem.answer.push({ valueString: cellValue as string });
            }

            if (rowItem.item) {
              rowItem.item.push(cellItem);
            }
          }
        } catch {
          // Skip cells that can't be parsed
          continue;
        }
      }

      // Only add the row item if it has sub-items
      if (rowItem.item && rowItem.item.length > 0 && matrixItem.item) {
        matrixItem.item.push(rowItem);
      }
    }

    return matrixItem.item && matrixItem.item.length > 0 ? matrixItem : undefined;
  } catch (error) {
    console.log('Failed to parse matrix answer:', error);
    return undefined;
  }
}
