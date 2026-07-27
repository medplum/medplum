// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, append, badRequest, EMPTY, isEmpty, isResource, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  CodeSystem,
  CodeSystemProperty,
  Coding,
  ValueSet,
  ValueSetComposeInclude,
  ValueSetComposeIncludeConcept,
  ValueSetComposeIncludeFilter,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import type { Repository } from '../repo';
import { repoAccess } from '../repository/access-tracker';
import type { Expression, PgQueryable } from '../sql';
import {
  Column,
  Condition,
  Conjunction,
  Constant,
  Disjunction,
  escapeLikeString,
  Parameter,
  SelectQuery,
  SqlFunction,
} from '../sql';
import { validateCodings } from './codesystemvalidatecode';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import type { ParentFilterStrategy } from './utils/terminology';
import {
  abstractProperty,
  addDescendants,
  addPropertyFilter,
  buildFilterMembershipExpression,
  findAncestor,
  findTerminologyResource,
  getParentProperty,
} from './utils/terminology';

const operation = getOperationDefinition('ValueSet', 'expand');

type ValueSetExpandParameters = {
  url?: string;
  filter?: string;
  offset?: number;
  count?: number;
  excludeNotForUI?: boolean;
  includeDesignations?: boolean;
  displayLanguage?: string;
  valueSet?: ValueSet;
};

/**
 * Implements FHIR ValueSet expansion.
 * @see https://www.hl7.org/fhir/operation-valueset-expand.html
 * @param req - The incoming request.
 * @returns The server response.
 */
export async function expandOperator(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ValueSetExpandParameters>(operation, req);
  const filter = params.filter;
  if (filter !== undefined && typeof filter !== 'string') {
    return [badRequest('Invalid filter')];
  }
  if (filter?.includes('\0')) {
    throw new OperationOutcomeError(badRequest('Filter value cannot contain null bytes'));
  }

  const repo = getAuthenticatedContext().repo;
  let valueSet = params.valueSet;
  if (!valueSet) {
    let url = params.url;
    if (!url) {
      return [badRequest('Missing url')];
    }

    const pipeIndex = url.indexOf('|');
    if (pipeIndex >= 0) {
      url = url.substring(0, pipeIndex);
    }

    valueSet = await findTerminologyResource<ValueSet>(repo, 'ValueSet', url);
  }

  if (params.filter && !params.count) {
    params.count = 10; // Default to small page size for typeahead queries
  }
  const result = await expandValueSet(repo, valueSet, params);

  return [allOk, buildOutputParameters(operation, result)];
}

const MAX_EXPANSION_SIZE = 1000;

export function filterIncludedConcepts(
  concepts: ValueSetComposeIncludeConcept[] | ValueSetExpansionContains[] | Coding[],
  params: ValueSetExpandParameters,
  system?: string
): ValueSetExpansionContains[] {
  const filter = params.filter?.trim().toLowerCase();
  return flattenConcepts(concepts, { filter, system, displayLanguage: params.displayLanguage });
}

function flattenConcepts(
  concepts: ValueSetComposeIncludeConcept[] | ValueSetExpansionContains[] | Coding[],
  options?: {
    filter?: string;
    system?: string;
    displayLanguage?: string;
  }
): ValueSetExpansionContains[] {
  const result: Coding[] = [];
  for (const concept of concepts) {
    const system = (concept as Coding).system ?? options?.system;
    if (!system) {
      throw new OperationOutcomeError(badRequest('Missing system for expansion code', 'ValueSet.expansion.contains'));
    }

    // Flatten contained codings recursively
    const contained = (concept as ValueSetExpansionContains).contains;
    if (contained) {
      result.push(...flattenConcepts(contained, options));
    }

    const filter = options?.filter;
    const display = getDisplayText(concept, options?.displayLanguage);
    if (!filter || matchesTextFilter(display, filter)) {
      result.push({ system, code: concept.code, display });
    }
  }

  return result;
}

export async function expandValueSet(
  repo: Repository,
  valueSet: ValueSet,
  params: ValueSetExpandParameters
): Promise<ValueSet> {
  const offset = Math.max(0, params.offset ?? 0);
  const count = params.count ?? MAX_EXPANSION_SIZE;
  const budget = Math.min(offset + count, MAX_EXPANSION_SIZE);

  const expander = new ValueSetExpander(repo, params);
  const expandedSet = await expander.expand(valueSet, budget);

  const contains = expandedSet.slice(offset, offset + count);
  await expander.hydrateDesignations(contains);
  valueSet.expansion = {
    total: expandedSet.length >= MAX_EXPANSION_SIZE ? MAX_EXPANSION_SIZE + 1 : expandedSet.length,
    timestamp: new Date().toISOString(),
    contains,
  };
  return valueSet;
}

class ValueSetExpander {
  private readonly repo: Repository;
  private readonly rootParams: ValueSetExpandParameters;
  /** Grow-only resolution cache of CodeSystems/ValueSets resolved during the operation */
  private readonly cache: Record<string, WithId<CodeSystem> | WithId<ValueSet>> = Object.create(null);
  /** In-progress ValueSet reference stack, used for cycle detection */
  private readonly stack = new Set<string>();
  /** Lazily-acquired database client, populated and returned by `this.database()` */
  private db?: PgQueryable;

  constructor(repo: Repository, rootParams: ValueSetExpandParameters) {
    this.repo = repo;
    this.rootParams = rootParams;
  }

  private database(): PgQueryable {
    this.db ??= getAuthenticatedContext().repo.getDatabaseClient(
      repoAccess.sqlRead('CodeSystem', { source: 'expand' })
    );
    return this.db;
  }

  private paramsFor(count: number): ValueSetExpandParameters {
    return count === this.rootParams.count ? this.rootParams : { ...this.rootParams, count };
  }

  /**
   * Resolve and cache a required CodeSystem by URL.
   * @param url - The CodeSystem URL.
   * @returns The resolved CodeSystem.
   */
  private async codeSystem(url: string): Promise<WithId<CodeSystem>> {
    const result = await this.optionalCodeSystem(url);
    if (result instanceof Error) {
      throw result;
    }
    return result;
  }

  private async optionalCodeSystem(url: string): Promise<WithId<CodeSystem> | Error> {
    const cached = this.cache[url] as WithId<CodeSystem> | undefined;
    if (cached && isResource(cached, 'CodeSystem')) {
      return cached;
    }
    let codeSystem: WithId<CodeSystem>;
    try {
      codeSystem = await findTerminologyResource<CodeSystem>(this.repo, 'CodeSystem', url);
    } catch (err: any) {
      return err;
    }
    this.cache[url] = codeSystem;
    return codeSystem;
  }

  private async resolveValueSet(url: string): Promise<WithId<ValueSet>> {
    const cached = this.cache[url] as WithId<ValueSet> | undefined;
    if (cached && isResource(cached, 'ValueSet')) {
      return cached;
    }
    const valueSet = await findTerminologyResource<ValueSet>(this.repo, 'ValueSet', url);
    this.cache[url] = valueSet;
    return valueSet;
  }

  /**
   * Runs `fn` with the nested ValueSet pushed onto the cycle-detection stack.
   * @param url - The nested ValueSet URL.
   * @param fn - Work to perform while the nested ValueSet is on the stack.
   * @returns The result of `fn`.
   * @throws When the ValueSet is already being recursively expanded
   */
  private async withNestedValueSet<T>(url: string, fn: (referenced: WithId<ValueSet>) => Promise<T>): Promise<T> {
    const referenced = await this.resolveValueSet(url);
    if (this.stack.has(url)) {
      throw new OperationOutcomeError(badRequest(`Recursive ValueSet reference: ${url}`));
    }
    this.stack.add(url);
    try {
      return await fn(referenced);
    } finally {
      this.stack.delete(url);
    }
  }

  /**
   * Computes the expansion of a ValueSet, bounded to at most `count` codes at this level plus one extra
   * so callers can detect when more are available and report that the expansion was truncated.
   * @param valueSet - The ValueSet to expand.
   * @param count - The maximum number of codes to produce at this level.
   * @returns The expanded set of codes.
   */
  async expand(valueSet: ValueSet, count: number): Promise<ValueSetExpansionContains[]> {
    // Use full expansion when already available
    if (this.isPreExpanded(valueSet)) {
      const all = filterIncludedConcepts(valueSet.expansion.contains, this.paramsFor(count));
      // Keep one more than `count` so a truncated pre-expansion still signals additional members exist
      return all.slice(0, count + 1);
    }

    if (!valueSet.compose?.include.length) {
      throw new OperationOutcomeError(badRequest('Missing ValueSet definition', 'ValueSet.compose.include'));
    }

    const expansion: ValueSetExpansionContains[] = [];
    for (const include of valueSet.compose.include) {
      await this.expandInclude(include, expansion, count);
      if (expansion.length >= count) {
        break; // Expansion limit exhausted; stop expanding further includes
      }
    }
    return expansion;
  }

  /**
   * Expands a single `compose.include`, dispatching on the kind of include: explicit concept list, or filtered selection.
   * @param include - The compose include to expand.
   * @param expansion - The expansion being accumulated.
   * @param count - The maximum number of codes to produce at this level.
   */
  private async expandInclude(
    include: ValueSetComposeInclude,
    expansion: ValueSetExpansionContains[],
    count: number
  ): Promise<void> {
    // Every include is bounded by the budget remaining after earlier includes, so the total count applies across the whole expansion
    const remaining = count - expansion.length;
    if (include.valueSet?.length && !include.system && !include.concept?.length && !include.filter?.length) {
      // Pure ValueSet reference(s), no other selection criteria
      if (include.valueSet.length === 1) {
        await this.withNestedValueSet(include.valueSet[0], async (vs) => {
          const nestedExpansion = await this.expand(vs, remaining);
          expansion.push(...nestedExpansion);
        });
      } else {
        // Intersection tracks the shared accumulator directly, so it receives the total target count
        await this.intersectReferences(include.valueSet, expansion, count);
      }
      return;
    }

    if (!include.system) {
      throw new OperationOutcomeError(
        badRequest('Missing system URL for ValueSet include', 'ValueSet.compose.include.system')
      );
    }
    const codeSystem = await this.codeSystem(include.system);

    if (include.concept && !include.valueSet?.length) {
      await this.includeConcepts(include, expansion, codeSystem, remaining);
    } else {
      await this.includeFromQuery(include, expansion, codeSystem, remaining);
    }
  }

  /**
   * Expands an explicit-concept include: validate the listed concepts against the CodeSystem and add the valid ones,
   * subject to the `count` budget (keeping one past `count` to signal further members).
   * @param include - The compose include (with `concept`).
   * @param expansion - The expansion being accumulated.
   * @param codeSystem - The resolved base CodeSystem.
   * @param count - The maximum number of codes to produce.
   */
  private async includeConcepts(
    include: ValueSetComposeInclude,
    expansion: ValueSetExpansionContains[],
    codeSystem: WithId<CodeSystem>,
    count: number
  ): Promise<void> {
    const params = this.paramsFor(count);
    const filteredCodings = filterIncludedConcepts(include.concept ?? [], params, include.system);
    const validCodings = await validateCodings(codeSystem, filteredCodings, params);
    const selected = validCodings.filter((c): c is ValueSetExpansionContains => Boolean(c));
    for (const c of selected.slice(0, count + 1)) {
      c.id = undefined;
      expansion.push(c);
    }
  }

  private isPreExpanded(vs: ValueSet): vs is ValueSet & { expansion: { contains: ValueSetExpansionContains[] } } {
    const ex = vs.expansion;
    return Boolean(ex?.contains?.length && !ex.parameter && (!ex.total || ex.total === ex.contains.length));
  }

  /**
   * Expands and adds to the expansion a query-driven include:
   * single-system selection (`system`/`concept`/`filter`) with optional
   * nested `valueSet` references.
   *
   * A base query selects codes from the system; an explicit `concept` list adds a `code IN (...)` restriction;
   * and each referenced ValueSet contributes a membership predicate that is ANDed with the other include criteria.
   * With no references and no concept list, this is a plain filtered selection.
   * An untranslatable membership test yields an empty include.
   * @param include - The compose include.
   * @param expansion - The expansion being accumulated.
   * @param codeSystem - The resolved base CodeSystem for `include.system`.
   * @param count - The maximum number of codes to produce.
   */
  private async includeFromQuery(
    include: ValueSetComposeInclude,
    expansion: ValueSetExpansionContains[],
    codeSystem: WithId<CodeSystem>,
    count: number
  ): Promise<void> {
    const db = this.database();
    await hydrateCodeSystemProperties(db, codeSystem);

    const params: ValueSetExpandParameters = { ...this.rootParams, offset: 0, count };
    const strategy = await chooseParentFilterStrategy(db, include, codeSystem, params);
    const query = expansionQuery(include, codeSystem, params, strategy);
    if (!query) {
      return;
    }
    const baseTableName = query.effectiveTableName;

    if (include.concept?.length) {
      query.whereExpr(
        new Condition(
          new Column(baseTableName, 'code'),
          'IN',
          include.concept.map((c) => c.code)
        )
      );
    }

    if (include.valueSet?.length) {
      const predicates = await this.collectMembershipPredicates(codeSystem, baseTableName, include.valueSet);
      if (!predicates) {
        return; // Untranslatable membership test yields an empty include instead of an over-broad one
      }
      for (const predicate of predicates) {
        query.whereExpr(predicate);
      }
    }

    // Page after all WHERE criteria are in place, so `count`/`offset` bound distinct codes rather than rows.
    const results: ExpansionRow[] = await finalizePaging(query, params).execute(db);
    addExpansionItems(results, expansion, codeSystem);
  }

  /**
   * Builds one membership predicate per referenced ValueSet, each TRUE for a base-`codeSystem` row that is a member
   * of that reference. Returns `undefined` on the first reference that cannot be translated;
   * callers must then yield an empty result rather than an over-broad one.
   * @param codeSystem - The base CodeSystem whose rows the predicates are evaluated against.
   * @param baseTableName - Table/alias of the base row (`Coding` or a descendant CTE).
   * @param urls - The referenced ValueSet URLs.
   * @param strategy - (optional) Hierarchy filtering strategy used.
   * @returns One predicate per url (order preserved), or `undefined` if any reference is untranslatable.
   */
  private async collectMembershipPredicates(
    codeSystem: WithId<CodeSystem>,
    baseTableName: string,
    urls: string[],
    strategy?: ParentFilterStrategy
  ): Promise<Expression[] | undefined> {
    const predicates: Expression[] = [];
    for (const url of urls) {
      const predicate = await this.withNestedValueSet(url, (vs) =>
        this.membershipPredicate(codeSystem, baseTableName, vs, strategy)
      );
      if (!predicate) {
        return undefined;
      }
      predicates.push(predicate);
    }
    return predicates;
  }

  /**
   * Intersects multiple referenced ValueSets within a single pure-`valueSet` include. A code is in the result iff
   * it is a member of *every* referenced ValueSet, so the intersection is pushed entirely into SQL: for each
   * candidate system, a base query over that system ANDs one membership predicate per reference. This keeps the
   * intersection order-independent and bounded by a per-system `LIMIT`; the shared `offset` is applied once, after
   * folding, by `expandValueSet`.
   *
   * Candidate systems are bounded by the first reference: the intersection can only contain systems that appear in
   * reference[0]. Each system is intersected independently and results accumulate across systems.
   * @param urls - The referenced ValueSet URLs (all are intersected symmetrically).
   * @param expansion - The expansion being accumulated.
   * @param count - The maximum number of codes to produce.
   */
  private async intersectReferences(
    urls: string[],
    expansion: ValueSetExpansionContains[],
    count: number
  ): Promise<void> {
    const first = await this.resolveValueSet(urls[0]);
    const candidateSystems = await this.collectSystems(first, new Set());
    if (!candidateSystems) {
      // Could not bound the intersection's systems (unresolvable nested reference). An empty result is
      // preferable to scanning every code system, and matches the membership path's untranslatable behavior.
      return;
    }

    const db = this.database();

    for (const systemUrl of candidateSystems) {
      if (expansion.length >= count) {
        break;
      }
      const codeSystem = await this.optionalCodeSystem(systemUrl);
      if (!isResource(codeSystem, 'CodeSystem')) {
        continue;
      }
      await hydrateCodeSystemProperties(db, codeSystem);

      // With a selective text filter the trigram-narrowed candidate set is small, so testing each candidate's
      // ancestry (per reference) beats materializing every reference's full subtree. Decide once per system.
      const strategy = await chooseStrategyByCandidates(db, codeSystem, this.rootParams.filter);

      // A code in this system is in the intersection iff it is a member of every referenced ValueSet.
      const predicates = await this.collectMembershipPredicates(codeSystem, 'Coding', urls, strategy);
      if (!predicates) {
        continue; // Exclude this system rather than include over-broadly
      }
      const query = new SelectQuery('Coding')
        .column('id')
        .column('code')
        .column('display')
        .column('synonymOf')
        .column('language')
        .where('system', '=', codeSystem.id);
      for (const predicate of predicates) {
        query.whereExpr(predicate);
      }

      // Apply shared expansion filters (text filter, language, excludeNotForUI) and fetch up to the remaining
      // budget for this system; the shared `offset` is applied once, after folding, by `expandValueSet`.
      const systemParams: ValueSetExpandParameters = { ...this.rootParams, offset: 0, count: count - expansion.length };
      const filtered = applyExpansionFilters(query, codeSystem, systemParams);
      if (!filtered) {
        continue;
      }
      const rows: ExpansionRow[] = await finalizePaging(filtered, systemParams).execute(db);
      const systemItems: ValueSetExpansionContains[] = [];
      addExpansionItems(rows, systemItems, codeSystem);
      expansion.push(...systemItems);
    }
  }

  /**
   * Collects the set of code system URLs a ValueSet can contain, from its pre-expansion (if any) and/or its
   * `compose.include` chain (recursing through nested `valueSet` references) to bound an intersection's
   * candidate systems.
   * @param valueSet - The ValueSet whose systems to collect.
   * @param seen - URLs already visited on this path, to guard against reference cycles.
   * @returns The set of system URLs, or `undefined` if a nested reference cannot be resolved.
   */
  private async collectSystems(valueSet: WithId<ValueSet>, seen: Set<string>): Promise<Set<string> | undefined> {
    const systems = new Set<string>();

    // Scan any present pre-expansion: `membershipPredicate` falls back to the pre-expansion (via `precomputedMembership`)
    // under looser conditions than `isPreExpanded`, so include those systems to avoid silently dropping members.
    // Over-approximating candidate systems is safe: an unusable system is skipped during predicate translation.
    if (valueSet.expansion?.contains?.length) {
      collectContainsSystems(valueSet.expansion.contains, systems);
    }

    for (const include of valueSet.compose?.include ?? EMPTY) {
      if (include.system) {
        systems.add(include.system);
      }
      for (const url of include.valueSet ?? EMPTY) {
        if (seen.has(url)) {
          continue; // Cycle on this path; reported during predicate translation
        }
        seen.add(url);
        let nested: WithId<ValueSet>;
        try {
          nested = await findTerminologyResource<ValueSet>(this.repo, 'ValueSet', url);
        } catch {
          return undefined; // Unresolvable nested reference; cannot bound systems
        }
        const nestedSystems = await this.collectSystems(nested, seen);
        if (!nestedSystems) {
          return undefined;
        }
        for (const s of nestedSystems) {
          systems.add(s);
        }
      }
    }

    return systems;
  }

  /**
   * Builds a predicate that is TRUE for a base `Coding` row (from `baseCodeSystem`) if and only if that code is a
   * member of the `referenced` ValueSet, restricted to that system. Concept lists become `code IN (...)`, filters
   * become correlated `EXISTS`/subtree semi-joins, and nested `valueSet` references recurse and AND together
   *
   * Fail-safe: if any criterion cannot be translated, the whole predicate is `undefined` and the caller
   * must yield an empty result rather than an over-broad one. A referenced set that has no base-system
   * members yields a `FALSE` predicate (empty result, not a failure)
   * @param baseCodeSystem - The base CodeSystem, whose rows the predicate is evaluated against.
   * @param baseTableName - Table/alias of the base row (`Coding` or a descendant CTE).
   * @param referenced - The referenced ValueSet whose membership is being tested.
   * @param strategy - (optional) Hierarchy filtering strategy used.
   * @returns The membership predicate, or `undefined` if it cannot be translated.
   */
  private async membershipPredicate(
    baseCodeSystem: WithId<CodeSystem>,
    baseTableName: string,
    referenced: WithId<ValueSet>,
    strategy?: ParentFilterStrategy
  ): Promise<Expression | undefined> {
    if (!referenced.compose?.include?.length) {
      // No logical definition; fall back to a pre-computed expansion if one is fully materialized
      return this.precomputedMembership(referenced, baseCodeSystem, baseTableName);
    }

    const includeTerms: Expression[] = [];
    for (const include of referenced.compose.include) {
      const term = await this.includeMembershipTerm(baseCodeSystem, baseTableName, include, strategy);
      if (term === undefined) {
        return undefined; // Untranslatable include; fail the whole predicate
      }
      if (term === TRUE_PREDICATE) {
        return TRUE_PREDICATE; // An include selects the entire base system: every base row is a member
      }
      if (term !== FALSE_PREDICATE) {
        includeTerms.push(term);
      }
    }

    if (!includeTerms.length) {
      return FALSE_PREDICATE; // No include contributes a base-system member; produce empty result
    }
    return includeTerms.length === 1 ? includeTerms[0] : new Disjunction(includeTerms);
  }

  /**
   * Membership fallback for a referenced ValueSet with no logical definition: use its pre-computed expansion, but
   * only when it is fully materialized. A missing or truncated expansion fails safe to
   * `undefined`; a full expansion with no base-system codes yields a `FALSE` predicate (empty result).
   * @param referenced - The referenced ValueSet.
   * @param baseCodeSystem - The base CodeSystem, whose rows the predicate is evaluated against.
   * @param baseTableName - Table/alias of the base row.
   * @returns The membership predicate, or `undefined` if no usable expansion is available.
   */
  private precomputedMembership(
    referenced: WithId<ValueSet>,
    baseCodeSystem: WithId<CodeSystem>,
    baseTableName: string
  ): Expression | undefined {
    const contains = referenced.expansion?.contains;
    if (!contains?.length) {
      return undefined; // Nothing usable to translate
    }
    if (referenced.expansion?.total && referenced.expansion.total > contains.length) {
      return undefined; // Truncated/partial pre-expansion
    }
    const codes = collectSystemCodes(contains, baseCodeSystem.url as string);
    return codes.length ? new Condition(new Column(baseTableName, 'code'), 'IN', codes) : FALSE_PREDICATE;
  }

  /**
   * Translates a single `compose.include` of a referenced ValueSet into a membership term over the base system.
   * @param baseCodeSystem - The base CodeSystem.
   * @param baseTableName - Table/alias of the base row.
   * @param include - The referenced include to translate.
   * @param strategy - (optional) Hierarchy filtering strategy used.
   * @returns `FALSE_PREDICATE` if the include cannot contain any base-system code,
   *   `TRUE_PREDICATE` if it selects the entire base system, or
   *   `undefined` if it cannot be translated.
   */
  private async includeMembershipTerm(
    baseCodeSystem: WithId<CodeSystem>,
    baseTableName: string,
    include: ValueSetComposeInclude,
    strategy?: ParentFilterStrategy
  ): Promise<Expression | undefined> {
    const conjuncts: Expression[] = [];

    if (include.system) {
      if (include.system !== baseCodeSystem.url) {
        // A base row always has the base system, so an include pinned to a different system can never match it
        return FALSE_PREDICATE;
      }
      if (include.concept?.length) {
        conjuncts.push(
          new Condition(
            new Column(baseTableName, 'code'),
            'IN',
            include.concept.map((c) => c.code)
          )
        );
      }
      for (const filter of include.filter ?? []) {
        const expr = buildFilterMembershipExpression(baseCodeSystem, baseTableName, filter, strategy);
        if (!expr) {
          return undefined;
        }
        conjuncts.push(expr);
      }
    } else if (!include.valueSet?.length) {
      return undefined; // Neither system nor valueSet → nothing to translate
    }

    for (const url of include.valueSet ?? []) {
      const nestedPred = await this.withNestedValueSet(url, (vs) =>
        this.membershipPredicate(baseCodeSystem, baseTableName, vs, strategy)
      );
      if (!nestedPred) {
        return undefined;
      }
      conjuncts.push(nestedPred);
    }

    if (!conjuncts.length) {
      // system === base with no concept/filter/valueSet criteria, so every base row is a member
      return TRUE_PREDICATE;
    } else if (conjuncts.length === 1) {
      return conjuncts[0];
    } else {
      return new Conjunction(conjuncts);
    }
  }

  /**
   * Attaches designations to the codes of the returned page. Skipped when `displayLanguage` is set,
   * since that path already returns the requested-language row as each code's primary display.
   * @param contains - The returned page of expansion codes, mutated in place to add designations.
   */
  async hydrateDesignations(contains: ValueSetExpansionContains[]): Promise<void> {
    if (!contains.length || this.rootParams.displayLanguage) {
      return;
    }
    const codesBySystem = new Map<string, string[]>();
    for (const c of contains) {
      if (!c.system || !c.code) {
        continue;
      }
      const existing = codesBySystem.get(c.system);
      if (existing) {
        existing.push(c.code);
      } else {
        codesBySystem.set(c.system, [c.code]);
      }
    }

    const db = this.database();
    for (const [systemUrl, codes] of codesBySystem) {
      const codeSystem = await this.optionalCodeSystem(systemUrl);
      if (!isResource(codeSystem, 'CodeSystem')) {
        continue; // System not resolvable (e.g. from a pre-expansion); leave those codes without designations
      }
      const query = new SelectQuery('Coding')
        .column('code')
        .column('display')
        .column('synonymOf')
        .column('language')
        .where('system', '=', codeSystem.id)
        .where('synonymOf', '!=', null)
        .where('code', 'IN', codes);
      if (!this.rootParams.includeDesignations) {
        query.where('language', '=', null); // Only base-language designations unless explicitly requested
      }
      const rows: ExpansionRow[] = await query.execute(db);
      const systemItems = contains.filter((c) => c.system === systemUrl);
      const designationRows = rows.filter((r) => systemItems.find((i) => i.code === r.code)?.display !== r.display);
      addExpansionItems(designationRows, systemItems, codeSystem);
    }
  }
}

const FALSE_PREDICATE = new Constant('FALSE');
const TRUE_PREDICATE = new Constant('TRUE');

/**
 * Recursively adds the systems referenced by a (possibly nested) pre-computed expansion into the given set.
 * @param contains - The `expansion.contains` entries to scan.
 * @param systems - The set to add systems to.
 */
function collectContainsSystems(contains: ValueSetExpansionContains[], systems: Set<string>): void {
  for (const c of contains) {
    if (c.system) {
      systems.add(c.system);
    }
    if (c.contains?.length) {
      collectContainsSystems(c.contains, systems);
    }
  }
}

/**
 * Collects the codes belonging to a given system from a (possibly nested) pre-computed expansion.
 * @param contains - The `expansion.contains` entries to scan.
 * @param system - The system URL to collect codes for.
 * @returns The matching codes.
 */
function collectSystemCodes(contains: ValueSetExpansionContains[], system: string): string[] {
  const codes: string[] = [];
  for (const c of contains) {
    if (c.contains?.length) {
      codes.push(...collectSystemCodes(c.contains, system));
    }
    if (c.system === system && c.code) {
      codes.push(c.code);
    }
  }
  return codes;
}

interface ExpansionRow {
  code: string;
  display: string | null;
  synonymOf: string | null;
  language: string | null;
}

/**
 * Adds rows from the database to the computed expansion, deduplicating/collecting synonyms of the same code
 * together into one entry.
 * @param rows - The database rows containing codes and display strings.
 * @param expansion - The expansion currently being generated.
 * @param codeSystem - The CodeSystem from which the codes are drawn.
 */
export function addExpansionItems(
  rows: ExpansionRow[],
  expansion: ValueSetExpansionContains[],
  codeSystem: WithId<CodeSystem>
): void {
  const system = codeSystem.url;
  for (const { code, display, synonymOf, language } of rows) {
    const ex = expansion.find((o) => o.code === code);
    if (ex) {
      if (isEmpty(synonymOf)) {
        // Incoming display string is the primary, replacing the one currently in the expansion
        if (ex.display) {
          ex.designation = append(ex.designation, { language: codeSystem.language, value: ex.display });
        }
        ex.display = display ?? undefined;
      } else if (display) {
        // Incoming display string is a synonym for the code already in the expansion
        ex.designation = append(ex.designation, { language: language ?? undefined, value: display });
      }
    } else {
      // New code being added to the expansion
      expansion.push({ system, code, display: display ?? undefined });
    }
  }
}

/**
 * Hydrate property IDs to optimize expensive DB queries.
 * @param db - Database connection
 * @param codeSystem - CodeSystem resource to hydrate
 */
export async function hydrateCodeSystemProperties(db: PgQueryable, codeSystem: WithId<CodeSystem>): Promise<void> {
  const propertyIds = await new SelectQuery('CodeSystem_Property')
    .column('id')
    .column('code')
    .where('system', '=', codeSystem.id)
    .execute(db);

  if (codeSystem.property?.length !== propertyIds.length && codeSystem.hierarchyMeaning === 'is-a') {
    // Implicit hierarchy property may be present; add it to the CodeSystem so it can be populated
    const parentProp = getParentProperty(codeSystem);
    codeSystem.property = append(codeSystem.property, parentProp);
  }
  // Populate property IDs from the database
  for (const property of codeSystem.property ?? EMPTY) {
    property.id = propertyIds.find((row) => row.code === property.code)?.id;
  }
}

export function expansionQuery(
  include: ValueSetComposeInclude,
  codeSystem: WithId<CodeSystem>,
  params?: ValueSetExpandParameters,
  strategy?: ParentFilterStrategy
): SelectQuery | undefined {
  let query: SelectQuery | undefined = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .column('synonymOf')
    .column('language')
    .where('system', '=', codeSystem.id);

  if (include.filter?.length) {
    query = applyValueSetFilters(query, include.filter, codeSystem, params, strategy);
  }
  if (params) {
    query = applyExpansionFilters(query, codeSystem, params);
  }
  return query;
}

function applyValueSetFilters(
  query: SelectQuery,
  filters: ValueSetComposeIncludeFilter[],
  codeSystem: WithId<CodeSystem>,
  params?: ValueSetExpandParameters,
  strategy?: ParentFilterStrategy
): SelectQuery | undefined {
  for (const condition of filters) {
    switch (condition.op) {
      case 'is-a':
      case 'descendent-of': {
        const parentProperty = getParentProperty(codeSystem);
        if (!parentProperty?.id) {
          return undefined;
        }
        const newQuery = addParentFilter(
          query,
          codeSystem,
          condition,
          parentProperty as WithId<CodeSystemProperty>,
          params,
          strategy
        );
        if (!newQuery) {
          return undefined;
        }
        query = newQuery;
        break;
      }

      case 'exists':
      case '=':
      case 'in': {
        const property = codeSystem.property?.find((p) => p.code === condition.property);
        if (!property?.id) {
          return undefined;
        }
        query = addPropertyFilter(query, condition, property as WithId<CodeSystemProperty>);
        break;
      }

      case 'is-not-a':
      case 'generalizes':
      case 'not-in':
      case 'regex': {
        // `generalizes` translates to a bounded ancestor semi-join (undefined → skip include when the CodeSystem has
        // no usable hierarchy). `is-not-a`/`not-in`/`regex` are unsupported and throw a loud error from
        // buildFilterMembershipExpression rather than silently returning an empty result — see that function.
        const expr = buildFilterMembershipExpression(codeSystem, query.effectiveTableName, condition);
        if (!expr) {
          return undefined;
        }
        query.whereExpr(expr);
        break;
      }

      default:
        getLogger().warn('Unknown filter type in ValueSet', { filter: condition });
        return undefined; // Unknown filter type, don't make DB query with incorrect filters
    }
  }

  return query;
}

/**
 * Candidate-count crossover for choosing between the `ancestor` and `descendant` strategies. Tuned to the
 * representative dataset: on a ~132k-node subtree the per-candidate ancestor walk costs ~60× a per-descendant
 * enumeration step, so materializing the subtree wins once the filter matches more than ~2000 candidate codes.
 */
const CANDIDATE_THRESHOLD = 2000;

/**
 * Builds the text-filter predicate used by `$expand` filtering: an exact code match, plus (for filters of at
 * least 3 characters) a per-word `display ILIKE` substring match. Below 3 characters the `display ILIKE
 * '%filter%'` branch cannot use the trigram GIN index (a substring needs at least one full trigram), so only the
 * exact code is matched.
 * @param filterText - The `filter` parameter value.
 * @param tableName - Table/alias that the `code` column belongs to (`Coding` or the descendant CTE).
 * @returns The WHERE expression selecting rows that match the filter text.
 */
function buildTextFilterPredicate(filterText: string, tableName: string): Expression {
  const codeCondition = new Condition(new Column(tableName, 'code'), '=', filterText);
  if (filterText.length < 3) {
    return codeCondition;
  }
  return new Disjunction([
    codeCondition,
    new Conjunction(
      filterText.split(/\s+/g).map((word) => new Condition('display', 'ILIKE', `%${escapeLikeString(word)}%`))
    ),
  ]);
}

/**
 * Counts, up to `limit`, the codes in a CodeSystem whose display/code matches the filter text.
 * Used to choose the parent-filter strategy.
 * @param db - Database client.
 * @param codeSystem - The CodeSystem being expanded (with resolved id).
 * @param filterText - The `filter` parameter value.
 * @param limit - Upper bound on the count (candidates beyond this don't change the decision).
 * @returns The number of matching candidate codes, capped at `limit`.
 */
export async function countCandidatesBounded(
  db: PgQueryable,
  codeSystem: WithId<CodeSystem>,
  filterText: string,
  limit: number
): Promise<number> {
  const inner = new SelectQuery('Coding')
    .column('id')
    .where('system', '=', codeSystem.id)
    .where('synonymOf', '=', null)
    .whereExpr(buildTextFilterPredicate(filterText, 'Coding'))
    .limit(limit);
  const countQuery = new SelectQuery('c', inner).raw('COUNT(*)::int AS "count"');
  const rows = await countQuery.execute(db);
  return rows[0]?.count ?? 0;
}

/**
 * Chooses the parent-filter strategy for an include. Only applies to a single `is-a`/`descendent-of` filter
 * combined with a text filter of at least 3 characters.
 * @param db - Database client.
 * @param include - The ValueSet compose include being expanded.
 * @param codeSystem - The CodeSystem being expanded (with resolved id).
 * @param params - The expand parameters (notably `filter`).
 * @returns The chosen strategy, or undefined when the cost-based choice does not apply.
 */
async function chooseParentFilterStrategy(
  db: PgQueryable,
  include: ValueSetComposeInclude,
  codeSystem: WithId<CodeSystem>,
  params: ValueSetExpandParameters
): Promise<ParentFilterStrategy | undefined> {
  const filterText = params.filter;
  if (!filterText || filterText.length < 3 || include.filter?.length !== 1) {
    return undefined;
  }
  const op = include.filter[0].op;
  if (op !== 'is-a' && op !== 'descendent-of') {
    return undefined;
  }

  return chooseStrategyByCandidates(db, codeSystem, filterText);
}

/**
 * Chooses between the `ancestor` and `descendant` hierarchy strategies for a given system purely from the bounded
 * count of codes matching the text filter: a selective filter (few candidates) favors per-candidate ancestor walks,
 * a broad one favors materializing the subtree once. Returns undefined when there is no usable text filter, so
 * callers keep their default (subtree) behavior.
 * @param db - Database client.
 * @param codeSystem - The CodeSystem whose candidates are counted (with resolved id).
 * @param filterText - The `filter` parameter value.
 * @returns The chosen strategy, or undefined when no text filter of at least 3 characters is present.
 */
async function chooseStrategyByCandidates(
  db: PgQueryable,
  codeSystem: WithId<CodeSystem>,
  filterText: string | undefined
): Promise<ParentFilterStrategy | undefined> {
  if (!filterText || filterText.length < 3) {
    return undefined;
  }
  const count = await countCandidatesBounded(db, codeSystem, filterText, CANDIDATE_THRESHOLD + 1);
  return count > CANDIDATE_THRESHOLD ? 'descendant' : 'ancestor';
}

export function addParentFilter(
  query: SelectQuery,
  codeSystem: WithId<CodeSystem>,
  condition: ValueSetComposeIncludeFilter,
  parentProperty: WithId<CodeSystemProperty>,
  params?: ValueSetExpandParameters,
  strategy: ParentFilterStrategy = 'ancestor'
): SelectQuery | undefined {
  if (params?.filter && strategy === 'ancestor') {
    if (params.filter.length < 3) {
      return undefined; // Must specify minimum filter length to make this expensive query workable
    }

    const base = new SelectQuery('Coding', undefined, 'origin')
      .column('id')
      .column('code')
      .column('display')
      .column('synonymOf')
      .column('language')
      .where(new Column('origin', 'system'), '=', codeSystem.id)
      .where(new Column('origin', 'code'), '=', new Column('Coding', 'code'));

    // For a selective text filter, test ancestry per candidate row: the trigram-matched set is small, so a
    // correlated EXISTS(walk up to the ancestor) is cheaper than materializing the whole subtree.
    const ancestorQuery = findAncestor(base, codeSystem, parentProperty, condition.value);
    query.whereExpr(new SqlFunction('EXISTS', [ancestorQuery]));
  } else {
    // No filter, or a broad text filter over a large subtree: materialize the descendant set once
    // and let applyExpansionFilters filter within it, instead of walking ancestors for every candidate
    query = addDescendants(query, codeSystem, parentProperty, condition.value);
  }
  if (condition.op !== 'is-a') {
    query.where(new Column(query.effectiveTableName, 'code'), '!=', condition.value);
  }
  return query;
}

function applyExpansionFilters(
  query: SelectQuery | undefined,
  codeSystem: WithId<CodeSystem>,
  params: ValueSetExpandParameters
): SelectQuery | undefined {
  if (!query) {
    return undefined;
  }

  if (params.filter) {
    query.whereExpr(buildTextFilterPredicate(params.filter, query.effectiveTableName));
  }

  if (params.displayLanguage) {
    query.where('language', '=', params.displayLanguage);
  } else if (!params.filter) {
    // No text filter: distinct codes are exactly the primary rows, so page over those directly (a base-language
    // synonym otherwise consumes a page slot for a code already counted, deflating the count and emptying deep pages).
    query.where('synonymOf', '=', null);
  } else if (!params.includeDesignations) {
    // Text-filtered: keep base-language rows (primary + base-language synonyms) so a code can match on a synonym;
    // `finalizePaging` collapses them to one row per code so paging still counts distinct codes.
    query.where('language', '=', null);
  }

  if (params.excludeNotForUI) {
    query = addAbstractFilter(query, codeSystem);
  }

  return query;
}

/**
 * Applies ranking and pagination to a fully-filtered expansion query, so that the page bounds count
 * distinct codes rather than raw Coding rows. Must be called after all WHERE criteria (text filter, concept list,
 * membership predicates) have been added.
 *
 * A text-filtered query may match a code on either primary display or synonym, so its rows are not unique.
 * Such queries keep the best-ranked row per code via `DISTINCT ON (code)` and then rank those distinct codes by
 * similarity in an outer query, so `LIMIT`/`OFFSET` operate on codes. Un-filtered and `displayLanguage` queries
 * already yield one row per code and are paged directly.
 * @param query - The filtered expansion query.
 * @param params - The expand parameters (notably `filter`, `count`, `offset`, `displayLanguage`).
 * @returns The paged query to execute.
 */
function finalizePaging(query: SelectQuery, params: ValueSetExpandParameters): SelectQuery {
  const limit = (params.count ?? MAX_EXPANSION_SIZE) + 1;
  const offset = params.offset ?? 0;
  const similarity = (table: string | undefined): Expression =>
    new SqlFunction('strict_word_similarity', [new Column(table, 'display'), new Parameter(params.filter as string)]);

  if (!params.filter || params.displayLanguage) {
    if (params.filter) {
      query.orderByExpr(similarity(undefined), true);
    }
    return query.limit(limit).offset(offset);
  }

  query.distinctOn(new Column(query.effectiveTableName, 'code')).orderByExpr(similarity(undefined), true);
  return new SelectQuery('distinct_codes', query)
    .column('code')
    .column('display')
    .column('synonymOf')
    .column('language')
    .orderByExpr(similarity('distinct_codes'), true)
    .limit(limit)
    .offset(offset);
}

function addAbstractFilter(query: SelectQuery, codeSystem: WithId<CodeSystem>): SelectQuery {
  const property = codeSystem.property?.find((p) => p.uri === abstractProperty);
  if (!property?.id) {
    return query; // Cannot add database filter; all found Coding rows must be considered selectable
  }

  // LEFT JOIN to check if abstract property is present
  const propertyTable = query.getNextJoinAlias();
  query.join(
    'LEFT JOIN',
    'Coding_Property',
    propertyTable,
    new Conjunction([
      new Condition(new Column(query.effectiveTableName, 'id'), '=', new Column(propertyTable, 'coding')),
      new Condition(new Column(propertyTable, 'property'), '=', property.id),
    ])
  );
  // Only return Coding rows where the property is NOT present
  query.where(new Column(propertyTable, 'value'), '=', null);

  return query;
}

function matchesTextFilter(text: string | undefined, filter: string): boolean {
  return text ? text.toLowerCase().includes(filter) : false;
}

function getDisplayText(
  concept: ValueSetComposeIncludeConcept | ValueSetExpansionContains | Coding,
  language?: string
): string | undefined {
  if (language && 'designation' in concept) {
    return concept.designation?.find((c) => c.language === language)?.value ?? concept.display;
  }
  return concept.display;
}
