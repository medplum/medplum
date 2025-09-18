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
  singleton,
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
      telecom: [{ system: 'url', value: 'http://www.hl7.org/Special/committees/fiwg' }],
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
  // First, allocate any UUIDs and evaluate context expressions
  allocIdExtension: 1,
  contextExtension: 2,
  // Then extract values into the template resource
  valueExtension: 3,
  // Alteratively, begin extraction into a template using this item
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

  // Scan Questionnaire for SDC extensions, excluding contained resource templates (which are scanned upon use)
  const extractor = new TemplateExtractor(questionnaire, response);
  crawlTypedValue(toTypedValue({ ...questionnaire, contained: undefined }), extractor, { skipMissingProperties: true });

  return [allOk, extractor.getTransactionBundle()];
}

type TemplateExtractionContext = {
  path: string;
  values: TypedValue[];
};

type ExtensionHandlerFn = (extension: TypedValueWithPath, parent: TypedValueWithPath) => void;

class TemplateExtractor implements CrawlerVisitor {
  private response: QuestionnaireResponse;
  private context: TemplateExtractionContext[]; // Context stack
  private variables: Record<string, TypedValue>;
  private templates: Record<string, Resource>;
  private bundle: Bundle;
  private patch: Operation[];

  constructor(questionnaire: Questionnaire, response: QuestionnaireResponse, variables?: Record<string, TypedValue>) {
    this.response = response;

    const typedResponse = toTypedValue(response);
    this.context = [{ path: 'Questionnaire', values: [typedResponse] }];

    // Gather template resources from Questionnaire by internal reference ID
    this.templates = Object.create(null);
    for (const resource of questionnaire.contained ?? []) {
      this.templates['#' + resource.id] = resource;
      resource.id = undefined;
    }

    // Initialize FHIRPath variables
    this.variables = variables ?? Object.create(null);
    this.variables['%resource'] = typedResponse;

    // Initialize output collections
    this.bundle = { resourceType: 'Bundle', type: 'transaction', entry: [] };
    this.patch = [];
  }

  private currentContext(): TemplateExtractionContext {
    return this.context[this.context.length - 1];
  }

  private evaluateExpression(expression: string | undefined, type: string): TypedValue | undefined;
  private evaluateExpression(expression: string | undefined): TypedValue[];
  private evaluateExpression(expression: string | undefined, type?: string): TypedValue[] | TypedValue | undefined {
    if (!expression) {
      return type ? undefined : [];
    }
    const context = this.currentContext().values;
    const results = evalFhirPathTyped(expression, context, this.variables);
    return type ? singleton(results, type) : results;
  }

  onExitObject(path: string, value: TypedValueWithPath, _schema: InternalTypeSchema): void {
    if (value.path === this.currentContext().path) {
      this.context.pop();
    }
  }

  private getTopLevelExtensions(
    path: string,
    propertyValues: (TypedValueWithPath | TypedValueWithPath[])[]
  ): TypedValueWithPath[] | undefined {
    if (!path.endsWith('.extension') || path.endsWith('.extension.extension')) {
      return undefined;
    }

    let results: TypedValueWithPath[];
    if (Array.isArray(propertyValues[0])) {
      results = propertyValues[0];
    } else {
      results = propertyValues as TypedValueWithPath[];
    }
    // Ensure SDC extensions are processed in the correct order
    return results.sort((a, b) => getOrder(a) - getOrder(b));
  }

  private extensionHandler(extension: Extension): ExtensionHandlerFn | undefined {
    switch (extension.url) {
      case allocIdExtension:
        return this.allocateId.bind(this);
      case contextExtension:
        return this.processContext.bind(this);
      case valueExtension:
        return this.processValue.bind(this);
      case extractExtension:
        return this.extractIntoTemplate.bind(this);
    }
    return undefined;
  }

  visitProperty(
    parent: TypedValueWithPath,
    _key: string,
    path: string,
    propertyValues: (TypedValueWithPath | TypedValueWithPath[])[],
    _schema: InternalTypeSchema
  ): void {
    // Scan for extensions throughout the resource that could contain SDC annotations
    const extensions = this.getTopLevelExtensions(path, propertyValues);
    if (extensions?.length) {
      for (const extension of extensions) {
        const handler = this.extensionHandler(extension.value as Extension);
        handler?.(extension, parent);
      }
    }
  }

  private allocateId(extension: TypedValueWithPath, _parent: TypedValueWithPath): void {
    const name = (extension.value as Extension).valueString;
    this.variables['%' + name] = { type: 'string', value: `urn:uuid:${randomUUID()}` };
  }

  private processContext(extension: TypedValueWithPath, parent: TypedValueWithPath): void {
    let results: TypedValue[];
    const { valueString, valueExpression } = extension.value as Extension;
    if (valueString) {
      results = this.evaluateExpression(valueString);
    } else if (valueExpression) {
      const { expression, language, name } = valueExpression;
      if (!expression || language !== 'text/fhirpath') {
        throw new OperationOutcomeError(
          badRequest('Questionnaire extraction context requires FHIRPath expression', extension.path)
        );
      }

      results = this.evaluateExpression(expression);

      // Assign named expressions as FHIRPath variables for evaluation of expressions on or underneath this element
      if (name) {
        // TODO: Ensure context variables are scoped to this subtree in the resource
        this.variables['%' + name] = results[0] ?? { type: 'undefined', value: undefined };
      }
    } else {
      throw new OperationOutcomeError(badRequest('Invalid extraction context extension', extension.path));
    }

    this.context.push({ path: parent.path, values: results });
    this.makePatch(results, parent.path, parent.value, extension);
  }

  private processValue(extension: TypedValueWithPath, parent: TypedValueWithPath): void {
    const { valueString: expression } = extension.value as Extension;
    const path = parent.path;
    const contextValues = this.currentContext().values;
    for (let i = 0; i < contextValues.length; i++) {
      const context = contextValues[i];
      const results = expression ? evalFhirPathTyped(expression, [context], this.variables) : [];
      this.makePatch(results, replacePathIndex(path, i, path.lastIndexOf('.')), parent.value, extension);
    }
  }

  private makePatch(results: TypedValue[], path: string, template: any, extension: TypedValueWithPath): void {
    const lastDotIndex = path.lastIndexOf('.');
    const isPrimitiveExtension = path[lastDotIndex + 1] === '_'; // Primitive extension fields are prefixed with _
    if (isPrimitiveExtension) {
      // Always remove primitive extension field
      this.patch.push({ op: 'remove', path: asJsonPath(path) });
      // Convert to "real" path
      path = path.slice(0, lastDotIndex + 1) + path.slice(lastDotIndex + 2);
    }

    const { url } = extension.value;
    if (!results.length) {
      // Remove element from template
      this.patch.push({ op: 'remove', path: asJsonPath(path) });
      return;
    }

    const isArrayElement = path.endsWith(']');
    if (isArrayElement) {
      this.patch.push({ op: 'remove', path: asJsonPath(path) }); // Remove template element
    }

    if (url === contextExtension) {
      for (let i = 0; i < results.length; i++) {
        if (isArrayElement) {
          path = replacePathIndex(path, i);
        }
        // Clone template object and remove SDC extension from it
        const extensionPath = path + extension.path.slice(extension.path.lastIndexOf('.extension'));
        this.patch.push(
          { op: 'add', path: asJsonPath(path), value: template },
          { op: 'remove', path: asJsonPath(extensionPath) }
        );
      }
    } else if (url === valueExtension) {
      if (isArrayElement) {
        const arrayPath = path.slice(0, path.lastIndexOf('['));
        this.patch.push({
          op: isPrimitiveExtension ? 'add' : 'replace',
          path: asJsonPath(arrayPath),
          value: results.map((r) => r.value),
        });
      } else {
        for (const value of results) {
          this.patch.push({ op: 'add', path: asJsonPath(path), value: value.value });
        }
      }
    }
  }

  /**
   * "Recurse" and scan the referenced template resource to populate it.
   * @param extension - The templateExtract extension.
   * @param parent - The element containing the extension.
   */
  private extractIntoTemplate(extension: TypedValueWithPath, parent: TypedValueWithPath): void {
    // Clone the template resource specified in the extension
    const templateRef = getExtension(extension.value, 'template')?.valueReference?.reference ?? '';
    const template: Resource | undefined = this.templates[templateRef];
    if (!template) {
      throw new OperationOutcomeError(badRequest(`Missing template resource ${templateRef}`, extension.path));
    }

    // Scan template resource and evaluate expressions to compute inserted values
    const contextValues = this.getExtractionContext(parent);
    for (const value of contextValues) {
      const resource = deepClone(template);
      this.context.push({ path: parent.path, values: [value] });
      crawlTypedValue(toTypedValue(resource), this, { skipMissingProperties: true });

      // Insert values into template resource and add to transaction Bundle
      const patch = this.getTemplatePatch();
      applyPatch(resource, patch);
      this.bundle.entry?.push(this.createBundleEntry(resource, extension.value as Extension));
    }
  }

  private createBundleEntry(resource: Resource, extension: Extension): BundleEntry {
    // Compute Bundle entry values from expressions in complex extension
    const idExpr = getExtension(extension, 'resourceId')?.valueString;
    const resourceId = this.evaluateExpression(idExpr, 'string')?.value as string | undefined;

    const urlExpr = getExtension(extension, 'fullUrl')?.valueString;
    const fullUrl: string = this.evaluateExpression(urlExpr, 'string')?.value ?? `urn:uuid:${randomUUID()}`;

    const ifMatchExpr = getExtension(extension, 'ifMatch')?.valueString;
    const ifMatch = this.evaluateExpression(ifMatchExpr, 'string')?.value as string | undefined;

    const ifNoneMatchExpr = getExtension(extension, 'ifNoneMatch')?.valueString;
    const ifNoneMatch = this.evaluateExpression(ifNoneMatchExpr, 'string')?.value as string | undefined;

    const ifNoneExistExpr = getExtension(extension, 'ifNoneExist')?.valueString;
    const ifNoneExist = this.evaluateExpression(ifNoneExistExpr, 'string')?.value as string | undefined;

    const ifModifiedSinceExpr = getExtension(extension, 'ifModifiedSince')?.valueString;
    const ifModifiedSince = this.evaluateExpression(ifModifiedSinceExpr, 'string')?.value as string | undefined;

    return {
      fullUrl,
      resource,
      request: {
        method: resourceId ? 'PUT' : 'POST',
        url: resourceId ? `${resource.resourceType}/${resourceId}` : resource.resourceType,
        ifMatch,
        ifNoneMatch,
        ifNoneExist,
        ifModifiedSince,
      },
    };
  }

  private getExtractionContext(parent: TypedValueWithPath): TypedValue[] {
    switch (parent.type) {
      case 'Questionnaire':
        return [toTypedValue(this.response)];
      case 'QuestionnaireItem': {
        const linkId = (parent.value as QuestionnaireItem).linkId;
        return flatMapFilter(this.response.item, (item) => extractResponseItem(item, linkId));
      }
      default:
        throw new OperationOutcomeError(badRequest('Extraction cannot begin on element of type ' + parent.type));
    }
  }

  getTransactionBundle(): Bundle {
    return this.bundle;
  }

  private getTemplatePatch(): Operation[] {
    const patch = this.patch;
    this.patch = [];
    return patch;
  }
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
  const result = '/' + path.slice(pathStart).replaceAll(/(\.|\[|\])+/g, '/');
  return result.endsWith('/') ? result.slice(0, result.length - 1) : result;
}

function replacePathIndex(path: string, index: number, before?: number): string {
  let arrayIndex: number;
  if (before && before >= 0) {
    arrayIndex = path.lastIndexOf('[', before);
  } else {
    arrayIndex = path.lastIndexOf('[');
  }
  if (arrayIndex === -1) {
    return path;
  }
  const result = path.slice(0, arrayIndex + 1) + index + path.slice(path.indexOf(']', arrayIndex));
  return result;
}
