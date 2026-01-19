// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { TypedValue } from '@medplum/core';
import {
  allOk,
  badRequest,
  evalFhirPathTyped,
  isEmpty,
  OperationOutcomeError,
  Operator,
  toTypedValue,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  Extension,
  Identifier,
  OperationDefinition,
  Parameters,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { parseInputParameters } from './utils/parameters';

// SDC extension URLs
const launchContextExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext';
const initialExpressionExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression';
const itemPopulationContextExtension =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-itemPopulationContext';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'Questionnaire-populate',
  url: 'http://hl7.org/fhir/uv/sdc/OperationDefinition/Questionnaire-populate',
  version: '3.0.0',
  name: 'SDCPopulateQuestionnaire',
  title: 'Populate Questionnaire',
  status: 'active',
  kind: 'operation',
  date: '2023-03-26',
  publisher: 'HL7 International / FHIR Infrastructure',
  description:
    'Generates a QuestionnaireResponse instance based on a specified Questionnaire, filling in answers to questions where possible based on information provided as part of the operation or already known by the server about the subject of the Questionnaire.',
  code: 'populate',
  resource: ['Questionnaire'],
  system: false,
  type: true,
  instance: true,
  parameter: [
    {
      name: 'identifier',
      use: 'in',
      min: 0,
      max: '1',
      documentation:
        'A logical questionnaire identifier (i.e. Questionnaire.identifier). The server must know the questionnaire or be able to retrieve it from other known repositories.',
      type: 'Identifier',
    },
    {
      name: 'questionnaire',
      use: 'in',
      min: 0,
      max: '1',
      documentation:
        'The Questionnaire to populate. Can be the canonical URL of the questionnaire, a Reference(Questionnaire), or the Questionnaire resource itself.',
      type: 'Questionnaire',
    },
    {
      name: 'canonical',
      use: 'in',
      min: 0,
      max: '1',
      documentation: 'The canonical URL of the Questionnaire to populate.',
      type: 'uri',
    },
    {
      name: 'questionnaireRef',
      use: 'in',
      min: 0,
      max: '1',
      documentation: 'A Reference to the Questionnaire to populate.',
      type: 'Reference',
    },
    {
      name: 'subject',
      use: 'in',
      min: 0,
      max: '1',
      documentation:
        'The resource that is to be the QuestionnaireResponse.subject. The QuestionnaireResponse instance will reference the provided subject.',
      type: 'Reference',
    },
    {
      name: 'context',
      use: 'in',
      min: 0,
      max: '*',
      documentation: 'Resources containing information to be used to help populate the QuestionnaireResponse.',
      part: [
        {
          name: 'name',
          use: 'in',
          min: 1,
          max: '1',
          documentation:
            'The name of the launchContext or variable the passed content should be used for. This name must match a launchContext or variable declared in the Questionnaire.',
          type: 'string',
        },
        {
          name: 'content',
          use: 'in',
          min: 1,
          max: '*',
          documentation: 'The actual resource (or resources) to use as the value of the context element.',
          type: 'Resource',
        },
      ],
    },
    {
      name: 'local',
      use: 'in',
      min: 0,
      max: '1',
      documentation:
        'If true, the server should use what resources and other knowledge it has about the subject when performing population.',
      type: 'boolean',
    },
    {
      name: 'response',
      use: 'out',
      min: 1,
      max: '1',
      documentation: 'The partially (or fully) populated set of answers for the specified Questionnaire.',
      type: 'QuestionnaireResponse',
    },
    {
      name: 'issues',
      use: 'out',
      min: 0,
      max: '1',
      documentation:
        'A list of hints and warnings about problems encountered while populating the questionnaire. Errors will be returned as an OperationOutcome instead.',
      type: 'OperationOutcome',
    },
  ],
};

type ContextParameter = {
  name?: string;
  content?: Reference | Reference[] | Resource | Resource[];
};

type PopulateParameters = {
  identifier?: Identifier;
  questionnaire?: Questionnaire;
  canonical?: string;
  questionnaireRef?: Reference;
  subject?: Reference;
  context?: ContextParameter | ContextParameter[];
  local?: boolean;
};

export async function populateHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<PopulateParameters>(operation, req);
  const { repo } = getAuthenticatedContext();

  // Resolve the Questionnaire resource
  let questionnaire: Questionnaire | undefined;

  // 1. Instance-level operation: use the id from the URL
  if (req.params.id) {
    questionnaire = await repo.readResource<Questionnaire>('Questionnaire', req.params.id);
  }
  // 2. Inline Questionnaire resource
  else if (params.questionnaire) {
    questionnaire = params.questionnaire;
  }
  // 3. Canonical URL
  else if (params.canonical) {
    const result = await repo.searchOne<Questionnaire>({
      resourceType: 'Questionnaire',
      filters: [{ code: 'url', operator: Operator.EQUALS, value: params.canonical }],
    });
    if (!result) {
      throw new OperationOutcomeError(badRequest(`Questionnaire with URL ${params.canonical} not found`));
    }
    questionnaire = result;
  }
  // 4. Reference to Questionnaire
  else if (params.questionnaireRef) {
    const ref = params.questionnaireRef.reference;
    if (!ref) {
      throw new OperationOutcomeError(badRequest('Invalid questionnaire reference'));
    }
    const [resourceType, id] = ref.split('/');
    if (resourceType !== 'Questionnaire' || !id) {
      throw new OperationOutcomeError(badRequest('Invalid questionnaire reference'));
    }
    questionnaire = await repo.readResource<Questionnaire>('Questionnaire', id);
  }
  // 5. Logical identifier
  else if (params.identifier) {
    const result = await repo.searchOne<Questionnaire>({
      resourceType: 'Questionnaire',
      filters: [
        { code: 'identifier', operator: Operator.EQUALS, value: `${params.identifier.system}|${params.identifier.value}` },
      ],
    });
    if (!result) {
      throw new OperationOutcomeError(
        badRequest(`Questionnaire with identifier ${params.identifier.system}|${params.identifier.value} not found`)
      );
    }
    questionnaire = result;
  }

  if (!questionnaire) {
    throw new OperationOutcomeError(
      badRequest('Questionnaire must be specified via id, questionnaire parameter, canonical, questionnaireRef, or identifier')
    );
  }

  // Build FHIRPath variables from context parameters
  const variables: Record<string, TypedValue> = Object.create(null);

  // Add questionnaire as a variable
  variables['%questionnaire'] = toTypedValue(questionnaire);

  // Resolve subject if provided
  let resolvedSubject: Resource | undefined;
  if (params.subject?.reference) {
    const [resourceType, id] = params.subject.reference.split('/');
    if (resourceType && id) {
      try {
        resolvedSubject = await repo.readResource(resourceType as 'Patient', id);
        variables['%subject'] = toTypedValue(resolvedSubject);
      } catch {
        // Subject may not be resolvable, that's OK
      }
    }
  }

  // Process context parameters
  const contexts = normalizeArray(params.context);
  for (const ctx of contexts) {
    if (!ctx.name) {
      continue;
    }
    const contents = normalizeArray(ctx.content);
    const resolvedContents: Resource[] = [];

    for (const content of contents) {
      if (isResource(content)) {
        resolvedContents.push(content);
      } else if (typeof content === 'object' && content !== null && 'reference' in content) {
        // Content is a Reference
        const ref = (content as Reference).reference;
        if (ref) {
          const [resourceType, id] = ref.split('/');
          if (resourceType && id) {
            try {
              const resource = await repo.readResource(resourceType as 'Patient', id);
              resolvedContents.push(resource);
            } catch {
              // Resource may not be resolvable, continue
            }
          }
        }
      }
    }

    if (resolvedContents.length === 1) {
      variables['%' + ctx.name] = toTypedValue(resolvedContents[0]);
    } else if (resolvedContents.length > 1) {
      variables['%' + ctx.name] = { type: 'Resource', value: resolvedContents };
    }
  }

  // Process launchContext extensions to validate and set up expected contexts
  const launchContexts = questionnaire.extension?.filter((e) => e.url === launchContextExtension) ?? [];
  for (const lc of launchContexts) {
    const nameExt = lc.extension?.find((e) => e.url === 'name');
    const name = nameExt?.valueCoding?.code || nameExt?.valueId;
    if (name && !variables['%' + name]) {
      // Launch context declared but not provided - could log a warning
    }
  }

  // Build the QuestionnaireResponse
  const responseItems = processItems(questionnaire.item ?? [], variables);

  const questionnaireResponse: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    questionnaire: questionnaire.url || `Questionnaire/${questionnaire.id}`,
    status: 'in-progress',
    item: responseItems.length > 0 ? responseItems : undefined,
  };

  // Add subject if provided
  if (params.subject) {
    questionnaireResponse.subject = params.subject;
  }

  // Build output Parameters resource
  const outputParameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'response',
        resource: questionnaireResponse,
      },
    ],
  };

  return [allOk, outputParameters];
}

function processItems(
  items: QuestionnaireItem[],
  variables: Record<string, TypedValue>
): QuestionnaireResponseItem[] {
  const result: QuestionnaireResponseItem[] = [];

  for (const item of items) {
    const processed = processItem(item, variables);
    if (Array.isArray(processed)) {
      result.push(...processed);
    } else if (processed) {
      result.push(processed);
    }
  }

  return result;
}

function processItem(
  item: QuestionnaireItem,
  variables: Record<string, TypedValue>
): QuestionnaireResponseItem | QuestionnaireResponseItem[] | undefined {
  // Check for itemPopulationContext (creates repeating items)
  const popContextExt = item.extension?.find((e) => e.url === itemPopulationContextExtension);
  if (popContextExt) {
    const expression = getExpression(popContextExt);
    if (expression) {
      try {
        const contextValues = evalFhirPathTyped(expression, [], variables);
        if (contextValues.length > 0) {
          const results = contextValues
            .map((val) => {
              const itemVars = { ...variables, '%context': val };
              return processItemWithContext(item, itemVars);
            })
            .filter((r): r is QuestionnaireResponseItem => r !== undefined);
          if (results.length > 0) {
            return results;
          }
        }
      } catch {
        // FHIRPath evaluation failed, continue without population
      }
    }
  }

  return processItemWithContext(item, variables);
}

function processItemWithContext(
  item: QuestionnaireItem,
  variables: Record<string, TypedValue>
): QuestionnaireResponseItem | undefined {
  const responseItem: QuestionnaireResponseItem = {
    linkId: item.linkId,
  };

  // Copy text if present
  if (item.text) {
    responseItem.text = item.text;
  }

  // Check for initialExpression
  const initialExprExt = item.extension?.find((e) => e.url === initialExpressionExtension);
  if (initialExprExt) {
    const expression = getExpression(initialExprExt);
    if (expression) {
      try {
        const results = evalFhirPathTyped(expression, [], variables);
        if (results.length > 0) {
          const answers = convertToAnswers(results, item.type);
          if (answers.length > 0) {
            responseItem.answer = answers;
          }
        }
      } catch {
        // FHIRPath evaluation failed, continue without this answer
      }
    }
  }

  // Fall back to initial values from the Questionnaire item
  if (!responseItem.answer && item.initial && item.initial.length > 0) {
    responseItem.answer = item.initial.map((init) => {
      const answer: QuestionnaireResponseItemAnswer = {};
      if (init.valueBoolean !== undefined) {
        answer.valueBoolean = init.valueBoolean;
      }
      if (init.valueDecimal !== undefined) {
        answer.valueDecimal = init.valueDecimal;
      }
      if (init.valueInteger !== undefined) {
        answer.valueInteger = init.valueInteger;
      }
      if (init.valueDate !== undefined) {
        answer.valueDate = init.valueDate;
      }
      if (init.valueDateTime !== undefined) {
        answer.valueDateTime = init.valueDateTime;
      }
      if (init.valueTime !== undefined) {
        answer.valueTime = init.valueTime;
      }
      if (init.valueString !== undefined) {
        answer.valueString = init.valueString;
      }
      if (init.valueUri !== undefined) {
        answer.valueUri = init.valueUri;
      }
      if (init.valueAttachment !== undefined) {
        answer.valueAttachment = init.valueAttachment;
      }
      if (init.valueCoding !== undefined) {
        answer.valueCoding = init.valueCoding;
      }
      if (init.valueQuantity !== undefined) {
        answer.valueQuantity = init.valueQuantity;
      }
      if (init.valueReference !== undefined) {
        answer.valueReference = init.valueReference;
      }
      return answer;
    });
  }

  // Process nested items recursively
  if (item.item && item.item.length > 0) {
    const nestedItems = processItems(item.item, variables);
    if (nestedItems.length > 0) {
      responseItem.item = nestedItems;
    }
  }

  // Only return the item if it has answers or nested items
  if (responseItem.answer || responseItem.item) {
    return responseItem;
  }

  // For groups, always include them if they have nested items structure
  if (item.type === 'group' && item.item && item.item.length > 0) {
    return responseItem;
  }

  return undefined;
}

function getExpression(extension: Extension): string | undefined {
  const expr = extension.valueExpression;
  if (expr?.language === 'text/fhirpath' && expr.expression) {
    return expr.expression;
  }
  return undefined;
}

function convertToAnswers(results: TypedValue[], itemType: string | undefined): QuestionnaireResponseItemAnswer[] {
  const answers: QuestionnaireResponseItemAnswer[] = [];

  for (const result of results) {
    const answer = convertToAnswer(result, itemType);
    if (answer && !isEmpty(answer)) {
      answers.push(answer);
    }
  }

  return answers;
}

function convertToAnswer(result: TypedValue, itemType: string | undefined): QuestionnaireResponseItemAnswer | undefined {
  const value = result.value;
  if (value === undefined || value === null) {
    return undefined;
  }

  const answer: QuestionnaireResponseItemAnswer = {};

  // Map based on the result type and item type
  switch (itemType) {
    case 'boolean':
      if (typeof value === 'boolean') {
        answer.valueBoolean = value;
      } else if (typeof value === 'string') {
        answer.valueBoolean = value === 'true';
      }
      break;

    case 'decimal':
      if (typeof value === 'number') {
        answer.valueDecimal = value;
      } else if (typeof value === 'string') {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          answer.valueDecimal = num;
        }
      }
      break;

    case 'integer':
      if (typeof value === 'number') {
        answer.valueInteger = Math.floor(value);
      } else if (typeof value === 'string') {
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
          answer.valueInteger = num;
        }
      }
      break;

    case 'date':
      if (typeof value === 'string') {
        answer.valueDate = value;
      }
      break;

    case 'dateTime':
      if (typeof value === 'string') {
        answer.valueDateTime = value;
      }
      break;

    case 'time':
      if (typeof value === 'string') {
        answer.valueTime = value;
      }
      break;

    case 'string':
    case 'text':
      if (typeof value === 'string') {
        answer.valueString = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        answer.valueString = String(value);
      }
      break;

    case 'url':
      if (typeof value === 'string') {
        answer.valueUri = value;
      }
      break;

    case 'choice':
    case 'open-choice':
      if (typeof value === 'object' && value !== null) {
        if ('system' in value || 'code' in value || 'display' in value) {
          answer.valueCoding = value;
        }
      } else if (typeof value === 'string') {
        answer.valueString = value;
      }
      break;

    case 'attachment':
      if (typeof value === 'object' && value !== null) {
        answer.valueAttachment = value;
      }
      break;

    case 'reference':
      if (typeof value === 'object' && value !== null && 'reference' in value) {
        answer.valueReference = value;
      } else if (typeof value === 'string') {
        answer.valueReference = { reference: value };
      }
      break;

    case 'quantity':
      if (typeof value === 'object' && value !== null) {
        answer.valueQuantity = value;
      } else if (typeof value === 'number') {
        answer.valueQuantity = { value };
      }
      break;

    default:
      // Try to infer the type from the value
      if (typeof value === 'boolean') {
        answer.valueBoolean = value;
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          answer.valueInteger = value;
        } else {
          answer.valueDecimal = value;
        }
      } else if (typeof value === 'string') {
        answer.valueString = value;
      } else if (typeof value === 'object' && value !== null) {
        if ('system' in value || 'code' in value) {
          answer.valueCoding = value;
        } else if ('reference' in value) {
          answer.valueReference = value;
        } else if ('value' in value && ('unit' in value || 'system' in value)) {
          answer.valueQuantity = value;
        }
      }
  }

  return answer;
}

function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function isResource(value: unknown): value is Resource {
  return typeof value === 'object' && value !== null && 'resourceType' in value;
}
