// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  allOk,
  badRequest,
  CrawlerVisitor,
  crawlTypedValue,
  evalFhirPathTyped,
  getExtension,
  InternalTypeSchema,
  OperationOutcomeError,
  Operator,
  toTypedValue,
  TypedValue,
  TypedValueWithPath,
} from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import {
  Bundle,
  BundleEntry,
  Extension,
  OperationDefinition,
  Questionnaire,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  Resource,
} from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import { parseInputParameters } from './utils/parameters';

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

// URIs of referenced SDC extensions
// @see https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-extr-template.html
const extractExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract';
const allocIdExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-extractAllocateId';
const contextExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext';
const valueExtension = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue';

const processingOrder: Record<string, number> = {
  allocIdExtension: 1,
  contextExtension: 2,
  valueExtension: 3,
  extractExtension: 4,
};
const defaultOrder = 5;
function getOrder(v: TypedValue): number {
  return processingOrder[v.value.url] ?? defaultOrder;
}

export async function extractHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ExtractParameters>(operation, req);
  const { repo } = getAuthenticatedContext();

  // Load QuestionnaireResponse and associated Questionnaire resources
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
    if (!result) {
      return [
        badRequest(`Questionnaire with URL ${response.questionnaire} not found`, 'QuestionnaireResponse.questionnaire'),
      ];
    }
    questionnaire = result;
  } else {
    return [
      badRequest('Questionnaire associated with the response must be specified', 'QuestionnaireResponse.questionnaire'),
    ];
  }

  // Scan Questionnaire for SDC extensions
  const extractor = new TemplateExtractor(questionnaire, response);
  crawlTypedValue(toTypedValue({ ...questionnaire, contained: undefined }), extractor, { skipMissingProperties: true });

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [],
  };

  return [allOk, bundle];
}

type TemplateExtractionContext = {
  path: string;
  values: TypedValue[];
};

class TemplateExtractor implements CrawlerVisitor {
  private questionnaire: Questionnaire;
  private response: QuestionnaireResponse;
  private context: TemplateExtractionContext[]; // Context stack
  private variables: Record<string, TypedValue>;
  private templates: Record<string, Resource>;

  constructor(questionnaire: Questionnaire, response: QuestionnaireResponse, variables?: Record<string, TypedValue>) {
    this.questionnaire = questionnaire;
    this.response = response;

    const typedResponse = toTypedValue(response);
    this.context = [{ path: 'QuestionnaireResponse', values: [typedResponse] }];

    // Gather template resources from Questionnaire by internal reference ID
    this.templates = Object.create(null);
    for (const resource of questionnaire.contained ?? []) {
      this.templates['#' + resource.id] = resource;
      resource.id = undefined;
    }

    // Initialize FHIRPath variables
    this.variables = variables ?? Object.create(null);
    this.variables['%resource'] = typedResponse;
  }

  onExitObject(path: string, value: TypedValueWithPath, _schema: InternalTypeSchema): void {
    if (value.path === this.currentContext().path) {
      this.context.pop();
    }
  }

  // onEnterResource(path: string, value: TypedValueWithPath, schema: InternalTypeSchema): void {
  //   console.log('ENTER RESOURCE', schema.name);
  // }

  // onExitResource(path: string, value: TypedValueWithPath, schema: InternalTypeSchema): void {
  //   console.log('EXIT RESOURCE', schema.name);
  // }

  private isTopLevelExtension(
    path: string,
    propertyValues: (TypedValueWithPath | TypedValueWithPath[])[]
  ): propertyValues is TypedValueWithPath[][] {
    return Array.isArray(propertyValues[0]) && path.endsWith('.extension') && !path.endsWith('.extension.extension');
  }

  visitProperty(
    parent: TypedValueWithPath,
    _key: string,
    path: string,
    propertyValues: (TypedValueWithPath | TypedValueWithPath[])[],
    _schema: InternalTypeSchema
  ): void {
    // Scan for extensions throughout the resource that could contain SDC annotations
    if (this.isTopLevelExtension(path, propertyValues)) {
      // Log extensions found in the resource
      console.log(path, JSON.stringify(propertyValues[0], null, 2), parent);

      // Process SDC extensions in order: first setting up context and variables, then extracting values;
      // or starting a new extraction into a resource template
      const extensions = propertyValues[0].sort((a, b) => getOrder(a) - getOrder(b));
      for (const ext of extensions) {
        const extension = ext.value as Extension;
        switch (extension.url) {
          // First allocate any UUIDs and evaluate context expressions
          case allocIdExtension:
            this.variables['%' + extension.valueString] = { type: 'string', value: randomUUID() };
            break;
          case contextExtension:
            this.processContext(extension, parent);
            break;

          // Then extract values into the template resource
          case valueExtension:
            this.processValue(extension.valueString as string, parent);
            break;

          // Alteratively, begin extraction into a template using this item
          case extractExtension:
            this.extractIntoTemplate(extension, parent);
            break;
        }
      }
    }
  }

  private currentContext(): TemplateExtractionContext {
    return this.context[this.context.length - 1];
  }

  private processContext(extension: Extension, parent: TypedValueWithPath): void {
    let results: TypedValue[];
    const context = this.currentContext().values;
    if (extension.valueString) {
      results = evalFhirPathTyped(extension.valueString, context, this.variables);
    } else if (extension.valueExpression) {
      const expr = extension.valueExpression;
      if (extension.valueExpression.language !== 'text/fhirpath' || !expr.expression) {
        throw new OperationOutcomeError(
          badRequest('Questionnaire extraction context requires FHIRPath expression', parent.path + '.extension')
        );
      }

      results = evalFhirPathTyped(expr.expression, context, this.variables);

      // Assign named expressions as FHIRPath variables for evaluation of expressions on or underneath this element
      if (expr.name) {
        // TODO: Ensure context variables are scoped to this subtree in the resource
        this.variables['%' + expr.name] = results[0] ?? { type: 'undefined', value: undefined };
      }
    } else {
      throw new OperationOutcomeError(badRequest('Invalid extraction context extension', parent.path + '.extension'));
    }

    this.context.push({ path: parent.path, values: results });
    this.makeModification(results, parent);
  }

  private extractIntoTemplate(extension: Extension, parent: TypedValueWithPath): void {
    // "Recurse" and scan the referenced template resource to populate it
    const templateRef = getExtension(extension, 'template')?.valueReference?.reference ?? '';
    const template: Resource | undefined = this.templates[templateRef];
    if (!template) {
      throw new OperationOutcomeError(
        badRequest(`Missing template resource ${templateRef}`, 'Questionnaire.contained')
      );
    }

    // TODO: Need to copy variables/context to stack before recursively scanning
    const context = parent.path === 'Questionnaire' ? this.response : this.extractResponseItem();
    const visitor = new TemplateExtractor(context, this.templates, this.variables);
    crawlTypedValue(toTypedValue(template), visitor, { skipMissingProperties: true });

    // TODO: Construct resource from template and add to Bundle
    // bundle.entry?.push(createBundleEntry(resource, extension));
  }

  private extractResponseItem(linkId: string): QuestionnaireResponseItem[] | undefined {
    return this.response.item?.filter((item) => item.linkId === linkId);
  }

  private processValue(expr: string, parent: TypedValueWithPath): void {
    // Evaluate expression in context and use value to generate patch ops
    const results = evalFhirPathTyped(expr, this.currentContext().values, this.variables);
    this.makeModification(results, parent);
  }

  private makeModification(results: TypedValue[], parent: TypedValueWithPath): void {
    console.log('===== MODIFY!', parent, results);
    // Compute JSON patch ops to modify template resource
    if (!results.length) {
      // Remove element from template
    } else {
      for (const element of results) {
        // Insert templated element(s) with context value
      }
    }
  }
}

function createBundleEntry(resource: Resource, extension: Extension): BundleEntry {
  const resourceId = getExtension(extension, 'resourceId')?.valueString;
  return {
    fullUrl: getExtension(extension, 'fullUrl')?.valueString ?? `urn:uuid:${randomUUID()}`,
    resource,
    request: {
      method: resourceId ? 'PUT' : 'POST',
      url: resourceId ? `${resource.resourceType}/${resourceId}` : resource.resourceType,
      // TODO: Include conditional header fields
    },
  };
}
