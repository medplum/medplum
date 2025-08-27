// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  allOk,
  badRequest,
  CrawlerVisitor,
  crawlTypedValue,
  getExtension,
  InternalTypeSchema,
  Operator,
  toTypedValue,
  TypedValue,
  TypedValueWithPath,
} from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import {
  Extension,
  OperationDefinition,
  Questionnaire,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  Resource,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'QuestionnaireResponse-extract',
  url: 'http://hl7.org/fhir/uv/sdc/OperationDefinition/QuestionnaireResponse-extract',
  version: '4.0.0',
  name: 'SDCQuestionnaireResponseExtract',
  title: 'Questionnaire response extract to resource(s)',
  status: 'active',
  kind: 'operation',
  date: '2018-08-30',
  publisher: 'HL7 International / FHIR Infrastructure',
  contact: [
    {
      name: 'HL7 International / FHIR Infrastructure',
      telecom: [
        {
          system: 'url',
          value: 'http://www.hl7.org/Special/committees/fiwg',
        },
      ],
    },
    {
      telecom: [
        {
          system: 'url',
          value: 'http://www.hl7.org/Special/committees/fiwg',
        },
      ],
    },
  ],
  description:
    'The Extract operation takes a completed QuestionnaireResponse and converts it to a FHIR resource or Bundle of resources by using metadata embedded in the Questionnaire the QuestionnaireResponse is based on.  \r\n  The extracted resources might include Observations, MedicationStatements and other standard FHIR resources which can then be shared and manipulated.\r\n  When invoking the $extract operation, care should be taken that the submitted QuestionnaireResponse is itself valid.  If not, the extract operation could fail (with appropriate OperationOutcomes)\r\n  or, more problematic, might succeed but provide incorrect output.',
  code: 'extract',
  comment:
    'The QuestionnaireResponse must identify a Questionnaire instance containing appropriate metadata to allow extraction.  (Refer to the [Data Extraction](extraction.html) page for more details.)',
  resource: ['QuestionnaireResponse'],
  system: false,
  type: true,
  instance: true,
  inputProfile: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/parameters-questionnaireresponse-extract-in',
  parameter: [
    {
      name: 'questionnaire-response',
      use: 'in',
      min: 0,
      max: '1',
      documentation:
        "The QuestionnaireResponse to extract data from.  Used when the operation is invoked at the 'type' level.",
      type: 'QuestionnaireResponse',
    },
    {
      name: 'questionnaire',
      use: 'in',
      min: 0,
      max: '1',
      documentation:
        'The Questionnaire associated with the QuestionnaireResponse.  Used if the server might not have access to the Questionnaire',
      type: 'Questionnaire',
    },
    {
      name: 'return',
      use: 'out',
      min: 0,
      max: '1',
      documentation:
        'The resulting FHIR resource produced after extracting data.  This will either be a single resource or a Transaction Bundle that contains multiple resources.  The operations in the Bundle might be creates, updates and/or conditional versions of both depending on the nature of the extraction mappings.',
      type: 'Resource',
    },
    {
      name: 'issues',
      use: 'out',
      min: 0,
      max: '1',
      documentation:
        "A list of hints and warnings about problems encountered while extracting the resource(s) from the QuestionnaireResponse. If there was nothing to extract, a 'success' OperationOutcome is returned with a warning and/or information messages. In situations where the input is invalid or the operation otherwise fails to complete successfully, a normal 'erroneous' OperationOutcome would be returned (as happens with all operations) indicating what the issue was.",
      type: 'OperationOutcome',
    },
  ],
} as unknown as OperationDefinition;

type ExtractParameters = {
  'questionnaire-response'?: QuestionnaireResponse;
  questionnaire?: Questionnaire;
};

export async function extractHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ExtractParameters>(operation, req);
  const { repo } = getAuthenticatedContext();

  let response: QuestionnaireResponse;
  if (req.params.id) {
    response = await repo.readResource('QuestionnaireResponse', req.params.id);
  } else if (params['questionnaire-response']) {
    response = params['questionnaire-response'];
  } else {
    return [badRequest('QuestionnaireResponse to extract must be specified')];
  }

  let questionnaire: Questionnaire;
  if (params.questionnaire) {
    questionnaire = params.questionnaire;
  } else if (response.questionnaire) {
    const result = await repo.searchOne<Questionnaire>({
      resourceType: 'Questionnaire',
      filters: [{ code: 'url', operator: Operator.EQUALS, value: response.questionnaire }],
    });
    if (result) {
      questionnaire = result;
    } else {
      return [
        badRequest(`Questionnaire with URL ${response.questionnaire} not found`, 'QuestionnaireResponse.questionnaire'),
      ];
    }
  } else {
    return [
      badRequest('Questionnaire associated with the response must be specified', 'QuestionnaireResponse.questionnaire'),
    ];
  }

  // Gather template resources by internal reference
  const templates: Record<string, Resource> = Object.create(null);
  for (const resource of questionnaire.contained ?? []) {
    resource.id = undefined;
    templates['#' + resource.id] = resource;
  }

  const extractExt = getExtension(
    response,
    'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract'
  );

  if (extractExt) {
    const templateRef = getExtension(extractExt, 'template')?.valueReference?.reference;
    const template: Resource | undefined = templates[templateRef ?? ''];
    if (!template) {
      return [badRequest(`Missing template resource ${templateRef}`, 'Questionnaire.contained')];
    }

    const resource = extractItem(response, extractExt, template);
  }

  const output = buildOutputParameters(operation, {});
  return [allOk, output];
}

function extractItem(
  item: QuestionnaireResponse | QuestionnaireResponseItem,
  ext: Extension,
  template: Resource
): Resource {
  const visitor = new TemplateExtractor(item);
  crawlTypedValue(toTypedValue(template), visitor);
  // TODO
}

class TemplateExtractor implements CrawlerVisitor {
  private context: TypedValue[];
  private variables: Record<string, TypedValue>;

  constructor(item: QuestionnaireResponse | QuestionnaireResponseItem) {
    this.context = [toTypedValue(item)];
    this.variables = Object.create(null);
  }

  onEnterObject?: ((path: string, value: TypedValueWithPath, schema: InternalTypeSchema) => void) | undefined;
  onExitObject?: ((path: string, value: TypedValueWithPath, schema: InternalTypeSchema) => void) | undefined;
  visitProperty: (
    parent: TypedValueWithPath,
    key: string,
    path: string,
    propertyValues: (TypedValueWithPath | TypedValueWithPath[])[],
    schema: InternalTypeSchema
  ) => void;
}
