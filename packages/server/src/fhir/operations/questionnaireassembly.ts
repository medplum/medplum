// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  badRequest,
  crawlTypedValue,
  deepClone,
  deepEquals,
  evalFhirPathTyped,
  OperationOutcomeError,
  toTypedValue,
  validateResource,
} from '@medplum/core';
import type { FhirRepository } from '@medplum/fhir-router';
import type { Extension, OperationOutcomeIssue, Questionnaire, QuestionnaireItem, Resource } from '@medplum/fhirtypes';
import { KNOWLEDGE_CAPABILITY_URL, QuestionnaireResolver } from './questionnaireassemblyresolver';
import { parseQuestionnaireCanonical } from './utils/questionnaire';

const SDC = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/';
export const SUB_QUESTIONNAIRE_EXTENSION_URL = SDC + 'sdc-questionnaire-subQuestionnaire';
export const ASSEMBLE_EXPECTATION_EXTENSION_URL = SDC + 'sdc-questionnaire-assemble-expectation';
export const ASSEMBLED_FROM_EXTENSION_URL = SDC + 'sdc-questionnaire-assembledFrom';
export const VARIABLE_EXTENSION_URL = 'http://hl7.org/fhir/StructureDefinition/variable';
const ASSEMBLE_CONTEXT_URL = SDC + 'sdc-questionnaire-assembleContext';
const LAUNCH_CONTEXT_URL = SDC + 'sdc-questionnaire-launchContext';
const LIBRARY_URL = 'http://hl7.org/fhir/StructureDefinition/cqf-library';
const CONSTRAINT_URL = 'http://hl7.org/fhir/StructureDefinition/targetConstraint';
const MODULAR_PROFILE = SDC + 'sdc-questionnaire-modular';
const COMPATIBILITY_EXTENSIONS = [
  'sdc-questionnaire-endpoint',
  'sdc-questionnaire-entryMode',
  'sdc-questionnaire-performerType',
  'sdc-rendering-criticalExtension',
].map((name) => SDC + name);
const FORBIDDEN_CHILD_ROOT_EXTENSIONS = new Set(
  [
    'definitionExtract',
    'itemExtractionContext',
    'itemPopulationContext',
    'observationExtract',
    'observation-extract-category',
    'observationLinkPeriod',
    'preferredTerminologyServer',
    'templateExtract',
    'templateExtractContext',
  ].map((name) => SDC + 'sdc-questionnaire-' + name)
);
const EXPECTATIONS = [
  'assemble-root',
  'assemble-child',
  'assemble-root-or-child',
  'independent-child',
  'independent-root-or-child',
];
// Limits include repeated occurrences, not just distinct modules. Bound work before expanding a copy.
const MAX_DEPTH = 32;
const MAX_ITEMS = 10000;
const MAX_MODULES = 1000;
const MAX_BYTES = 5 * 1024 * 1024;

type Container = Questionnaire | QuestionnaireItem;
type Scope = { container: Container; parent?: Scope; prefix?: string };
export type AssemblyResult = { questionnaire: Questionnaire; issues: OperationOutcomeIssue[] };

/**
 * Expands whole SDC modules without writing or modifying any input resources.
 * @param repo - Authenticated repository for all reads.
 * @param input - Root Questionnaire.
 * @param resolver - Optional request-local resolver, including warnings from the root lookup.
 * @returns The assembled copy and warnings.
 */
export async function assembleQuestionnaire(
  repo: FhirRepository,
  input: Questionnaire,
  resolver = new QuestionnaireResolver(repo)
): Promise<AssemblyResult> {
  return new QuestionnaireAssembler(resolver).assemble(input);
}

class QuestionnaireAssembler {
  private root!: Questionnaire;
  private readonly provenance = new Set<string>();
  private readonly contained = new Map<string, Resource>();
  private readonly warnings = new Set<string>();
  private readonly contextChecks: { name: string; canonical: string; scope: Scope }[] = [];
  private itemCount = 0;
  private moduleCount = 0;
  private byteCount = 0;

  private readonly resolver: QuestionnaireResolver;

  constructor(resolver: QuestionnaireResolver) {
    this.resolver = resolver;
  }

  async assemble(input: Questionnaire): Promise<AssemblyResult> {
    this.checkBudget(input, 0);
    this.root = deepClone(input);
    validateResource(this.root);
    this.checkExpectation(this.root, false);
    if (extensions(this.root, ASSEMBLE_CONTEXT_URL).length) {
      fail('A Questionnaire with assembleContext must be assembled through its parent');
    }
    this.checkVariables(this.root);
    this.normalizeRootDependencies();
    this.registerContained(this.root);
    const scope = extendScope(this.root);
    await this.expandContainer(this.root, this.root, scope, new Set([questionnaireKey(input)]), 0);
    this.root.contained = this.contained.size ? [...this.contained.values()] : undefined;
    this.checkVariables(this.root);
    this.checkContexts();
    this.checkResult();
    this.finalize();
    this.checkConstraintKeys();
    if (Buffer.byteLength(JSON.stringify(this.root)) > MAX_BYTES) {
      fail('Assembled Questionnaire exceeds the 5 MiB output limit');
    }
    // SDC $assemble step 6 reports final conformance findings as warnings for author review.
    // Assembly failures above still throw; only this final validation check is recoverable.
    try {
      this.resolver.issues.push(...validateResource(this.root));
    } catch (error) {
      if (!(error instanceof OperationOutcomeError)) {
        throw error;
      }
      this.resolver.issues.push(
        ...error.outcome.issue.map((issue): OperationOutcomeIssue => ({
          ...issue,
          severity: issue.severity === 'error' || issue.severity === 'fatal' ? 'warning' : issue.severity,
        }))
      );
    }
    return { questionnaire: this.root, issues: this.resolver.issues };
  }

  private async expandContainer(
    container: Container,
    owner: Questionnaire,
    scope: Scope,
    stack: Set<string>,
    depth: number
  ): Promise<void> {
    if (depth > MAX_DEPTH) {
      fail(`Assembly exceeds the maximum depth of ${MAX_DEPTH}`);
    }
    const result: QuestionnaireItem[] = [];
    for (const item of container.item ?? []) {
      if (++this.itemCount > MAX_ITEMS) {
        fail(`Assembly exceeds the ${MAX_ITEMS} item limit`);
      }
      this.checkVariables(item);
      const imports = extensions(item, SUB_QUESTIONNAIRE_EXTENSION_URL);
      if (imports.length) {
        this.checkPlaceholder(item, imports);
        const canonical = imports[0].valueCanonical as string;
        const childSource = await this.resolver.resolve(canonical);
        const key = questionnaireKey(childSource);
        if (stack.has(key)) {
          fail(`Item '${item.linkId}': circular subQuestionnaire reference to ${canonical}`);
        }
        this.checkBudget(childSource, depth + 1);
        this.checkChild(owner, childSource, scope, canonical);
        this.checkExpectation(childSource, true);
        const child = deepClone(childSource);
        // A module's import prefix applies to ALL of its own items. A declaration inside
        // it only changes the context for further imports, not the IDs of its own descendants.
        prefixModule(child, scope.prefix);
        this.registerContained(child);
        const childScope = extendScope(child, scope);
        const childStack = new Set(stack).add(key);
        await this.expandContainer(child, childSource, childScope, childStack, depth + 1);
        this.propagateExtensions(child, container);
        result.push(...(child.item ?? []));
        const provenance = questionnaireCanonical(childSource);
        if (provenance && provenance !== questionnaireCanonical(this.root)) {
          this.provenance.add(provenance);
        }
        for (const ext of extensions(childSource, ASSEMBLED_FROM_EXTENSION_URL)) {
          if (ext.valueCanonical) {
            this.provenance.add(ext.valueCanonical);
          }
        }
      } else {
        const itemScope = extendScope(item, scope);
        await this.expandContainer(item, owner, itemScope, stack, depth + 1);
        result.push(item);
      }
    }
    if (container.item) {
      container.item = result;
    }
  }

  private checkBudget(questionnaire: Questionnaire, depth: number): void {
    if (++this.moduleCount > MAX_MODULES || depth > MAX_DEPTH) {
      fail('Assembly exceeds the module or nesting limit');
    }
    // Walk iteratively before cloning/crawling so deeply nested input cannot exhaust the stack.
    const pending: { value: unknown; depth: number }[] = [{ value: questionnaire, depth: 0 }];
    while (pending.length) {
      const entry = pending.pop() as { value: unknown; depth: number };
      if (entry.depth > 128) {
        fail('Questionnaire input is nested too deeply');
      }
      if (entry.value && typeof entry.value === 'object') {
        for (const value of Object.values(entry.value)) {
          pending.push({ value, depth: entry.depth + 1 });
        }
      }
    }
    this.byteCount += Buffer.byteLength(JSON.stringify(questionnaire));
    if (this.byteCount > MAX_BYTES) {
      fail('Assembly exceeds the 5 MiB expanded-input limit');
    }
    visitItems(questionnaire.item ?? [], (item) => {
      if (item.definition !== undefined) {
        fail(`Item '${item.linkId}': item.definition assembly is not supported`);
      }
    });
  }

  private checkExpectation(questionnaire: Questionnaire, child: boolean): void {
    const tags = extensions(questionnaire, ASSEMBLE_EXPECTATION_EXTENSION_URL);
    const code = tags[0]?.valueCode;
    if (tags.length > 1 || (tags.length === 1 && !EXPECTATIONS.includes(code ?? ''))) {
      fail(`Questionnaire ${questionnaireKey(questionnaire)} has an invalid assemble-expectation`);
    }
    if (child && code === 'assemble-root') {
      fail(`Questionnaire ${questionnaireKey(questionnaire)} is assemble-root and cannot be used as a child`);
    }
    if (!code && (child || hasImports(questionnaire.item ?? []))) {
      this.warn(
        `Questionnaire ${questionnaireKey(questionnaire)} is missing assemble-expectation; assembly continues, but the input is not claimed to be SDC-conformant`
      );
    }
  }

  private checkPlaceholder(item: QuestionnaireItem, imports: Extension[]): void {
    if (imports.length !== 1 || !imports[0].valueCanonical) {
      fail(`Item '${item.linkId}' must have exactly one subQuestionnaire with valueCanonical`);
    }
    if (item.type !== 'display' || item.item?.length) {
      fail(`Item '${item.linkId}': subQuestionnaire requires a display item without children`);
    }
    if (item.enableWhen?.length || extensions(item, SDC + 'sdc-questionnaire-enableWhenExpression').length) {
      fail(`Item '${item.linkId}': put module conditions on a containing group`);
    }
    if (extensions(item, VARIABLE_EXTENSION_URL).length) {
      fail(`Item '${item.linkId}': put variables on a surviving containing group, not the removed placeholder`);
    }
  }

  private checkChild(parent: Questionnaire, child: Questionnaire, scope: Scope, canonical: string): void {
    // Medplum policy: moving this declaration to the parent would change sibling import/runtime scopes.
    if (extensions(child, VARIABLE_EXTENSION_URL).some((e) => e.valueExpression?.name === 'linkIdPrefix')) {
      fail(`SubQuestionnaire ${canonical}: put linkIdPrefix on the parent or a group inside the module`);
    }
    if (extensions(child, SDC + 'sdc-questionnaire-questionnaireAdaptive').length) {
      fail(`SubQuestionnaire ${canonical} must not be adaptive`);
    }
    visitObjects(child, (object) => {
      if (Array.isArray(object.modifierExtension) && object.modifierExtension.length) {
        fail(`SubQuestionnaire ${canonical} must not contain modifierExtension`);
      }
    });
    for (const field of ['implicitRules', 'language'] as const) {
      if (child[field] && child[field] !== parent[field]) {
        fail(`SubQuestionnaire ${canonical} has incompatible ${field}`);
      }
    }
    for (const security of child.meta?.security ?? []) {
      if (!parent.meta?.security?.some((candidate) => deepEquals(candidate, security))) {
        fail(`SubQuestionnaire ${canonical} has security labels absent from its parent`);
      }
    }
    for (const url of COMPATIBILITY_EXTENSIONS) {
      for (const extension of extensions(child, url)) {
        if (!extensions(parent, url).some((candidate) => deepEquals(candidate, extension))) {
          fail(`SubQuestionnaire ${canonical} has incompatible ${url}`);
        }
      }
    }
    for (const extension of child.extension ?? []) {
      if (FORBIDDEN_CHILD_ROOT_EXTENSIONS.has(extension.url)) {
        fail(`SubQuestionnaire ${canonical}: ${extension.url} must be on an allowed item, not the child root`);
      }
    }
    for (const dependency of extensions(child, ASSEMBLE_CONTEXT_URL)) {
      if (!dependency.valueString) {
        fail(`SubQuestionnaire ${canonical} has an assembleContext without a variable name`);
      }
      this.contextChecks.push({ name: dependency.valueString, canonical, scope });
    }
    this.checkVariables(child);
  }

  private checkContexts(): void {
    // SDC permits declarations later in a scope. Keep live container references until
    // all imports have propagated their variables and global launch contexts.
    const launchNames = new Set(
      extensions(this.root, LAUNCH_CONTEXT_URL).map(
        (e) => e.extension?.find((part) => part.url === 'name')?.valueCoding?.code
      )
    );
    for (const { name, canonical, scope } of this.contextChecks) {
      let available = launchNames.has(name);
      for (let current: Scope | undefined = scope; current && !available; current = current.parent) {
        available = extensions(current.container, VARIABLE_EXTENSION_URL).some((e) => e.valueExpression?.name === name);
      }
      if (!available) {
        fail(`SubQuestionnaire ${canonical} requires unavailable assembleContext '${name}'`);
      }
    }
  }

  private checkVariables(container: Container): void {
    const names = new Set(
      extensions(container, LAUNCH_CONTEXT_URL).map(
        (e) => e.extension?.find((part) => part.url === 'name')?.valueCoding?.code
      )
    );
    for (const variable of extensions(container, VARIABLE_EXTENSION_URL)) {
      const name = variable.valueExpression?.name;
      if (!name || names.has(name)) {
        fail(`Duplicate or missing variable name '${name ?? ''}' in ${containerLabel(container)}`);
      }
      names.add(name);
    }
  }

  private propagateExtensions(child: Questionnaire, container: Container): void {
    for (const extension of child.extension ?? []) {
      switch (extension.url) {
        case LIBRARY_URL:
        case LAUNCH_CONTEXT_URL:
          this.addRootDependency(extension);
          break;
        case VARIABLE_EXTENSION_URL:
          if (
            extensions(container, VARIABLE_EXTENSION_URL).some(
              (e) => e.valueExpression?.name === extension.valueExpression?.name
            )
          ) {
            fail(`Variable '${extension.valueExpression?.name}' is duplicated in ${containerLabel(container)}`);
          }
          container.extension = [...(container.extension ?? []), deepClone(extension)];
          break;
        case CONSTRAINT_URL:
          container.extension = [...(container.extension ?? []), deepClone(extension)];
          break;
        // SDC requires other child-root metadata to be omitted. Item annotations remain intact.
      }
    }
  }

  private normalizeRootDependencies(): void {
    const dependencies = (this.root.extension ?? []).filter(
      (e) => e.url === LIBRARY_URL || e.url === LAUNCH_CONTEXT_URL
    );
    this.root.extension = this.root.extension?.filter((e) => e.url !== LIBRARY_URL && e.url !== LAUNCH_CONTEXT_URL);
    for (const extension of dependencies) {
      this.addRootDependency(extension);
    }
  }

  private addRootDependency(extension: Extension): void {
    const candidates = extensions(this.root, extension.url);
    if (extension.url === LIBRARY_URL) {
      if (!extension.valueCanonical) {
        fail('cqf-library requires valueCanonical');
      }
      const canonical = extension.valueCanonical;
      // Contained library references are also valid and have already been prefixed.
      const identity = canonical.startsWith('#') ? canonical : parseQuestionnaireCanonical(canonical).url;
      const existing = candidates.find((e) => e.valueCanonical?.split('|')[0] === identity);
      if (existing) {
        if (existing.valueCanonical !== canonical) {
          fail(`Incompatible library versions for ${identity}`);
        }
        return;
      }
    } else {
      const name = extension.extension?.find((e) => e.url === 'name')?.valueCoding;
      if (!name?.code) {
        fail('launchContext requires a name code');
      }
      const existing = candidates.find((e) => {
        const candidate = e.extension?.find((nested) => nested.url === 'name')?.valueCoding;
        return candidate?.code === name.code;
      });
      if (existing) {
        if (!deepEquals(launchContextRequirements(existing), launchContextRequirements(extension))) {
          fail(`Incompatible launchContext '${name.code}'`);
        }
        return;
      }
    }
    this.root.extension = [...(this.root.extension ?? []), deepClone(extension)];
  }

  private registerContained(questionnaire: Questionnaire): void {
    for (const resource of questionnaire.contained ?? []) {
      if (!resource.id || !/^[A-Za-z0-9.-]{1,64}$/.test(resource.id)) {
        fail(
          `Contained resource id '${resource.id ?? '(missing)'}' in ${questionnaireKey(questionnaire)} is invalid after prefixing; use 1 to 64 characters from A-Z, a-z, 0-9, '-' or '.'`
        );
      }
      const existing = this.contained.get(resource.id);
      if (existing && !deepEquals(existing, resource)) {
        fail(`Contained resource id '${resource.id}' is used by different resources`);
      }
      this.contained.set(resource.id, resource);
    }
  }

  private checkResult(): void {
    const ids = new Set<string>();
    const items: QuestionnaireItem[] = [];
    visitItems(this.root.item ?? [], (item) => {
      if (!item.linkId || item.linkId.length > 255 || ids.has(item.linkId)) {
        fail(`Duplicate or invalid Questionnaire linkId '${item.linkId}'`);
      }
      ids.add(item.linkId);
      items.push(item);
    });
    for (const item of items) {
      for (const condition of item.enableWhen ?? []) {
        if (!ids.has(condition.question) || condition.question === item.linkId) {
          fail(`Item '${item.linkId}' has a dangling or self-referencing enableWhen.question '${condition.question}'`);
        }
      }
    }
    transformLocalReferences(this.root, (reference) => {
      // '#' alone refers to the containing resource, not a missing contained id.
      if (reference !== '#' && !this.contained.has(reference.slice(1))) {
        fail(`Dangling contained reference '${reference}'`);
      }
      return reference;
    });
  }

  private checkConstraintKeys(): void {
    const keys = new Set<string>();
    const visit = (container: Container, path: string): void => {
      container.extension?.forEach((extension, index) => {
        if (extension.url !== CONSTRAINT_URL) {
          return;
        }
        const key = extension.extension?.find((part) => part.url === 'key')?.valueId;
        if (!key) {
          return;
        }
        if (keys.has(key)) {
          this.resolver.issues.push({
            severity: 'warning',
            code: 'invariant',
            details: { text: `Duplicate targetConstraint key '${key}'; keys must be unique within the Questionnaire` },
            expression: [`${path}.extension[${index}]`],
          });
        }
        keys.add(key);
      });
      container.item?.forEach((item, index) => visit(item, `${path}.item[${index}]`));
    };
    visit(this.root, 'Questionnaire');
  }

  private finalize(): void {
    const adjusted: Extension[] = [];
    const capabilities = new Set<string>();
    for (const extension of this.root.extension ?? []) {
      if (extension.url === ASSEMBLE_EXPECTATION_EXTENSION_URL) {
        if (extension.valueCode !== 'assemble-root') {
          adjusted.push({ ...extension, valueCode: extension.valueCode?.replace(/^assemble/, 'independent') });
        }
      } else if (extension.url === KNOWLEDGE_CAPABILITY_URL) {
        if (!['shareable', 'computable', 'publishable', 'executable'].includes(extension.valueCode ?? '')) {
          fail('Invalid cqf-knowledgeCapability code');
        }
        if (!capabilities.has(extension.valueCode as string)) {
          capabilities.add(extension.valueCode as string);
          adjusted.push(extension);
        }
      } else if (extension.url === ASSEMBLED_FROM_EXTENSION_URL) {
        if (extension.valueCanonical) {
          this.provenance.add(extension.valueCanonical);
        }
      } else {
        adjusted.push(extension);
      }
    }
    if (!capabilities.has('executable')) {
      adjusted.push({ url: KNOWLEDGE_CAPABILITY_URL, valueCode: 'executable' });
    }
    for (const canonical of this.provenance) {
      adjusted.push({ url: ASSEMBLED_FROM_EXTENSION_URL, valueCanonical: canonical });
    }
    this.root.extension = adjusted;
    delete this.root.id;
    delete this.root.text;
    if (this.root.meta) {
      // Carry business tags/security, not Medplum storage/compartment or revision metadata.
      const { security, tag, extension } = this.root.meta;
      const profiles = this.root.meta.profile?.filter((p) => p.split('|')[0] !== MODULAR_PROFILE);
      const profile = profiles?.length ? profiles : undefined;
      this.root.meta =
        security?.length || tag?.length || extension?.length || profile?.length
          ? { security, tag, extension, profile }
          : undefined;
    }
    // Preserve business URL/version. See HL7/sdc commit 972f226 (FHIR-40554).
  }

  private warn(message: string): void {
    if (!this.warnings.has(message)) {
      this.warnings.add(message);
      this.resolver.issues.push({ severity: 'warning', code: 'business-rule', details: { text: message } });
    }
  }
}

function fail(message: string): never {
  throw new OperationOutcomeError(badRequest(message));
}

function extensions(container: Container, url: string): Extension[] {
  return container.extension?.filter((e) => e.url === url) ?? [];
}

/**
 * Compares launch requirements without description/display text or resource-type ordering.
 * @param extension - SDC launchContext declaration.
 * @returns The context identity, allowed resource types, and multiplicity declaration.
 */
function launchContextRequirements(extension: Extension): object {
  const parts = extension.extension ?? [];
  const name = parts.find((e) => e.url === 'name')?.valueCoding;
  return {
    system: name?.system,
    version: name?.version,
    code: name?.code,
    types: [...new Set(parts.filter((e) => e.url === 'type').map((e) => e.valueCode))].sort(),
    multiplesAllowed: parts.find((e) => e.url === 'multiplesAllowed')?.valueBoolean,
  };
}

function containerLabel(container: Container): string {
  return 'linkId' in container ? `item '${container.linkId}'` : questionnaireKey(container);
}

function questionnaireCanonical(questionnaire: Questionnaire): string | undefined {
  return questionnaire.url ? questionnaire.url + (questionnaire.version ? `|${questionnaire.version}` : '') : undefined;
}

function questionnaireKey(questionnaire: Questionnaire): string {
  return questionnaireCanonical(questionnaire) ?? `Questionnaire/${questionnaire.id ?? '(inline)'}`;
}

function hasImports(items: QuestionnaireItem[]): boolean {
  return items.some((item) => extensions(item, SUB_QUESTIONNAIRE_EXTENSION_URL).length || hasImports(item.item ?? []));
}

function extendScope(container: Container, inherited?: Scope): Scope {
  const scope: Scope = { container, parent: inherited, prefix: inherited?.prefix };
  for (const extension of extensions(container, VARIABLE_EXTENSION_URL)) {
    const variable = extension.valueExpression;
    if (variable?.name !== 'linkIdPrefix') {
      continue;
    }
    const expression = variable.expression;
    // Deliberately bounded assembly-time subset. Runtime expressions elsewhere are kept as authored.
    if (
      variable.language !== 'text/fhirpath' ||
      !expression ||
      !/^(?:%linkIdPrefix\s*\+\s*)?'(?:[^'\\]|\\.)*'$/.test(expression.trim())
    ) {
      fail(
        `Unsupported linkIdPrefix expression in ${containerLabel(container)}; use a string literal or %linkIdPrefix + 'suffix'`
      );
    }
    if (expression.includes('%linkIdPrefix') && inherited?.prefix === undefined) {
      fail(`Missing inherited linkIdPrefix in ${containerLabel(container)}`);
    }
    const values = evalFhirPathTyped(
      expression,
      [],
      inherited?.prefix === undefined ? {} : { '%linkIdPrefix': toTypedValue(inherited.prefix) }
    );
    if (values.length !== 1 || typeof values[0].value !== 'string') {
      fail(`linkIdPrefix must evaluate to one string in ${containerLabel(container)}`);
    }
    scope.prefix = values[0].value;
  }
  return scope;
}

function prefixModule(questionnaire: Questionnaire, prefix: string | undefined): void {
  if (!prefix) {
    return;
  }
  visitItems(questionnaire.item ?? [], (item) => {
    item.linkId = prefix + item.linkId;
    for (const condition of item.enableWhen ?? []) {
      condition.question = prefix + condition.question;
    }
  });
  for (const resource of questionnaire.contained ?? []) {
    if (resource.id) {
      resource.id = prefix + resource.id;
    }
  }
  transformLocalReferences(questionnaire, (reference) =>
    reference === '#' ? reference : `#${prefix}${reference.slice(1)}`
  );
}

/**
 * Visits typed reference/canonical fields, including arrays and contained resources, never expression strings.
 * @param questionnaire - Resource to traverse.
 * @param transform - Rewrite or check a local reference.
 */
function transformLocalReferences(questionnaire: Questionnaire, transform: (reference: string) => string): void {
  crawlTypedValue(
    toTypedValue(questionnaire),
    {
      visitProperty(parent, key, _path, values) {
        if (values.flat().some((v) => v.type === 'canonical') || (parent.type === 'Reference' && key === 'reference')) {
          const rewrite = (value: unknown): unknown =>
            typeof value === 'string' && value.startsWith('#') ? transform(value) : value;
          const value = parent.value[key];
          parent.value[key] = Array.isArray(value) ? value.map(rewrite) : rewrite(value);
        }
      },
    },
    { skipMissingProperties: true }
  );
}

function visitItems(items: QuestionnaireItem[], visit: (item: QuestionnaireItem) => void): void {
  for (const item of items) {
    visit(item);
    visitItems(item.item ?? [], visit);
  }
}

function visitObjects(value: unknown, visit: (object: Record<string, unknown>) => void): void {
  if (value && typeof value === 'object') {
    visit(value as Record<string, unknown>);
    for (const nested of Object.values(value)) {
      visitObjects(nested, visit);
    }
  }
}
