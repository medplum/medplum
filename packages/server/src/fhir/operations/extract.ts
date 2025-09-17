// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  allOk,
  badRequest,
  CrawlerVisitor,
  crawlTypedValue,
  deepClone,
  evalFhirPathTyped,
  flatMapFilter,
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
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  Resource,
} from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { applyPatch, Operation } from 'rfc6902';
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

  return [allOk, extractor.getTransactionBundle()];
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

  private bundle: Bundle;
  private patch: Operation[];

  constructor(
    questionnaire: Questionnaire,
    response: QuestionnaireResponse,
    variables?: Record<string, TypedValue>,
    context?: TemplateExtractionContext
  ) {
    this.questionnaire = questionnaire;
    this.response = response;

    const typedResponse = toTypedValue(response);
    this.context = [context ?? { path: 'Questionnaire', values: [typedResponse] }];

    // Gather template resources from Questionnaire by internal reference ID
    this.templates = Object.create(null);
    for (const resource of questionnaire.contained ?? []) {
      this.templates['#' + resource.id] = resource;
      resource.id = undefined;
    }

    // Initialize FHIRPath variables
    this.variables = variables ?? Object.create(null);
    this.variables['%resource'] = typedResponse;

    this.bundle = { resourceType: 'Bundle', type: 'transaction', entry: [] };
    this.patch = [];
  }

  onExitObject(path: string, value: TypedValueWithPath, _schema: InternalTypeSchema): void {
    if (value.path === this.currentContext().path) {
      this.context.pop();
    }
  }

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
            this.processContext(ext, parent);
            break;

          // Then extract values into the template resource
          case valueExtension:
            this.processValue(ext, parent);
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

  private processContext(ext: TypedValueWithPath, parent: TypedValueWithPath): void {
    let results: TypedValue[];
    const context = this.currentContext().values;
    const extension = ext.value as Extension;
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
    this.makeModification(results, parent, ext);
  }

  private extractIntoTemplate(extension: Extension, parent: TypedValueWithPath): void {
    // "Recurse" and scan the referenced template resource to populate it
    const templateRef = getExtension(extension, 'template')?.valueReference?.reference ?? '';
    const template: Resource | undefined = deepClone(this.templates[templateRef]);
    if (!template) {
      throw new OperationOutcomeError(
        badRequest(`Missing template resource ${templateRef}`, 'Questionnaire.contained')
      );
    }

    // TODO: Need to copy variables/context to stack before recursively scanning
    const context = this.extractResponseItem(parent);
    const visitor = new TemplateExtractor(this.questionnaire, this.response, this.variables, {
      path: parent.path,
      values: context,
    });
    crawlTypedValue(toTypedValue(template), visitor, { skipMissingProperties: true });

    const patch = visitor.getTemplatePatch();
    applyPatch(template, patch);
    this.bundle.entry?.push(createBundleEntry(template, extension));
  }

  private extractResponseItem(parent: TypedValueWithPath): TypedValue[] {
    if (parent.type === 'Questionnaire') {
      return [toTypedValue(this.response)];
    } else if (parent.type === 'QuestionnaireItem') {
      const linkId = (parent.value as QuestionnaireItem).linkId;
      return flatMapFilter(this.response.item, (item) => extractResponseItem(item, linkId));
    } else {
      throw new OperationOutcomeError(badRequest('Extraction cannot begin on element of type ' + parent.type));
    }
  }

  private processValue(ext: TypedValueWithPath, parent: TypedValueWithPath): void {
    const expr = ext.value.valueString as string;
    // Evaluate expression in context and use value to generate patch ops
    const results = evalFhirPathTyped(expr, this.currentContext().values, this.variables);
    this.makeModification(results, parent, ext);
  }

  private makeModification(results: TypedValue[], parent: TypedValueWithPath, ext: TypedValueWithPath): void {
    let path = parent.path;
    const lastPathSegmentIndex = path.lastIndexOf('.');
    const isPrimitiveExtension = path[lastPathSegmentIndex + 1] === '_';
    if (isPrimitiveExtension) {
      // Primitive extensions should always be removed
      this.patch.push({ op: 'remove', path: asJsonPath(path) });

      // Convert to "real" path
      path = path.slice(0, lastPathSegmentIndex + 1) + path.slice(lastPathSegmentIndex + 2);
    }

    const extensionUrl = ext.value.url as string;
    if (!results.length) {
      // Remove element from template
      this.patch.push({ op: 'remove', path: asJsonPath(path) });
    } else {
      for (const element of results) {
        // Clone template object and remove SDC extension
        const templateElement = parent.value;
        if (extensionUrl === contextExtension) {
          if (isPrimitiveExtension) {
            this.patch.push({ op: 'add', path: asJsonPath(path), value: templateElement });
          }
          this.patch.push({ op: 'remove', path: asJsonPath(ext.path) });
        }

        // Insert templated element(s) with context value
        if (extensionUrl === valueExtension) {
          this.patch.push({
            op: isPrimitiveExtension ? 'add' : 'replace',
            path: asJsonPath(path),
            value: element.value,
          });
        }
      }
    }
  }

  getTransactionBundle(): Bundle {
    return this.bundle;
  }

  getTemplatePatch(): Operation[] {
    return this.patch;
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

function extractResponseItem(item: QuestionnaireResponseItem, linkId: string): TypedValue | TypedValue[] | undefined {
  // Link IDs are unique within the entire Questionnaire, so it's safe to use this at any level of the
  // possibly-nested hierarchy for matching; we don't need to consider the full path of linkIds
  if (item.linkId === linkId) {
    return toTypedValue(item);
  } else if (item.item) {
    return flatMapFilter(item.item, (nestedItem) => extractResponseItem(nestedItem, linkId));
  } else {
    return undefined;
  }
}

function asJsonPath(path: string): string {
  const pathStart = path.indexOf('.') + 1;
  let result = '/' + path.slice(pathStart).replaceAll(/(\.|\[|\])+/g, '/');
  if (result.endsWith('/')) {
    result = result.slice(0, result.length - 1); // Trim trailing slash
  }
  return result;
}
