import {
  ConceptMap,
  StructureMap,
  StructureMapGroup,
  StructureMapGroupInput,
  StructureMapGroupRule,
  StructureMapGroupRuleDependent,
  StructureMapGroupRuleSource,
  StructureMapGroupRuleTarget,
  StructureMapGroupRuleTargetParameter,
} from '@medplum/fhirtypes';
import { generateId } from '../crypto';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { getTypedPropertyValue, toJsBoolean, toTypedValue } from '../fhirpath/utils';
import { TypedValue } from '../types';
import { InternalSchemaElement, tryGetDataType } from '../typeschema/types';
import { conceptMapTranslate } from './conceptmaptranslate';

interface TransformContext {
  root: StructureMap;
  loader?: (url: string) => StructureMap[];
  parent?: TransformContext;
  variables?: Record<string, TypedValue[] | TypedValue>;
}

/**
 * Transforms input values using a FHIR StructureMap.
 *
 * See: https://www.hl7.org/fhir/mapping-language.html
 *
 * @param structureMap - The StructureMap to transform.
 * @param input - The input values.
 * @param loader - Optional loader function for loading imported StructureMaps.
 * @returns The transformed values.
 */
export function structureMapTransform(
  structureMap: StructureMap,
  input: TypedValue[],
  loader?: (url: string) => StructureMap[]
): TypedValue[] {
  return evalStructureMap({ root: structureMap, loader }, structureMap, input);
}

/**
 * Evaluates a FHIR StructureMap.
 *
 * @param ctx - The transform context.
 * @param structureMap - The FHIR StructureMap definition.
 * @param input - The input values.
 * @returns The transformed values.
 * @internal
 */
function evalStructureMap(ctx: TransformContext, structureMap: StructureMap, input: TypedValue[]): TypedValue[] {
  evalImports(ctx, structureMap);
  hoistGroups(ctx, structureMap);
  return evalGroup(ctx, structureMap.group[0], input);
}

/**
 * Evaluates the imports in a FHIR StructureMap.
 * For each import statement, the loader function is called to load the imported StructureMap.
 * The imported StructureMap is then hoisted into the current context.
 * @param ctx - The transform context.
 * @param structureMap - The FHIR StructureMap definition.
 * @internal
 */
function evalImports(ctx: TransformContext, structureMap: StructureMap): void {
  if (ctx.loader && structureMap.import) {
    for (const url of structureMap.import) {
      const importedMaps = ctx.loader(url as string);
      for (const importedMap of importedMaps) {
        hoistGroups(ctx, importedMap);
      }
    }
  }
}

/**
 * Hoists the groups in a FHIR StructureMap into the current context.
 * This is necessary to allow groups to reference each other.
 *
 * @param ctx - The transform context.
 * @param structureMap - The FHIR StructureMap definition.
 * @internal
 */
function hoistGroups(ctx: TransformContext, structureMap: StructureMap): void {
  if (structureMap.group) {
    for (const group of structureMap.group) {
      setVariable(ctx, group.name as string, { type: 'StructureMapGroup', value: group });
    }
  }
}

/**
 * Evaluates a FHIR StructureMapGroup.
 *
 * A "group" is similar to a function in a programming language.
 *
 * @param ctx - The transform context.
 * @param group - The FHIR StructureMapGroup definition.
 * @param input - The input values.
 * @returns The transformed values.
 * @internal
 */
function evalGroup(ctx: TransformContext, group: StructureMapGroup, input: TypedValue[]): TypedValue[] {
  const sourceDefinitions: StructureMapGroupInput[] = [];
  const targetDefinitions: StructureMapGroupInput[] = [];

  for (const inputDefinition of group.input as StructureMapGroupInput[]) {
    if (inputDefinition.mode === 'source') {
      sourceDefinitions.push(inputDefinition);
    }
    if (inputDefinition.mode === 'target') {
      targetDefinitions.push(inputDefinition);
    }
  }

  if (sourceDefinitions.length === 0) {
    throw new Error('Missing source definitions');
  }

  if (targetDefinitions.length === 0) {
    throw new Error('Missing target definitions');
  }

  if (input.length < sourceDefinitions.length) {
    throw new Error(`Not enough arguments (got ${input.length}, min ${sourceDefinitions.length})`);
  }

  if (input.length > sourceDefinitions.length + targetDefinitions.length) {
    throw new Error(
      `Too many arguments (got ${input.length}, max ${sourceDefinitions.length + targetDefinitions.length})`
    );
  }

  const variables: Record<string, TypedValue> = {};
  const outputs = [];
  let inputIndex = 0;

  for (const sourceDefinition of sourceDefinitions) {
    safeAssign(variables, sourceDefinition.name as string, input[inputIndex++]);
  }

  for (const targetDefinition of targetDefinitions) {
    const output = input[inputIndex++] ?? { type: targetDefinition.type ?? 'BackboneElement', value: {} };
    safeAssign(variables, targetDefinition.name as string, output);
    outputs.push(output);
  }

  const newContext: TransformContext = { root: ctx.root, parent: ctx, variables };

  if (group.rule) {
    for (const rule of group.rule) {
      evalRule(newContext, rule);
    }
  }

  return outputs;
}

/**
 * Entry point for evaluating a rule.
 * Rule sources are evaluated first, followed by the rule target, child rules, and dependent groups.
 * Rule sources are evaluated recursively to handle multiple source statements.
 *
 * @param ctx - The transform context.
 * @param rule - The FHIR Mapping rule definition.
 * @internal
 */
function evalRule(ctx: TransformContext, rule: StructureMapGroupRule): void {
  // https://build.fhir.org/mapping-language.html#7.8.0.8.1
  // If there are multiple source statements, the rule applies for the permutation of the source elements from each source statement.
  // E.g. if there are 2 source statements, each with 2 matching elements, the rule applies 4 times, one for each combination.
  // Typically, if there is more than one source statement, only one of the elements would repeat.
  // If any of the source data elements have no value, then the rule never applies;
  // only existing permutations are executed: for multiple source statements, all of them need to match.
  if (rule.source) {
    evalRuleSourceAt(ctx, rule, 0);
  }
}

/**
 * Recursively evaluates a rule at a specific source index.
 *
 * @param ctx - The transform context.
 * @param rule - The FHIR Mapping rule definition.
 * @param index - The source index to evaluate.
 * @internal
 */
function evalRuleSourceAt(
  ctx: TransformContext,
  rule: StructureMapGroupRule & { source: StructureMapGroupRuleSource[] },
  index: number
): void {
  const source = rule.source[index];
  for (const sourceValue of evalSource(ctx, source)) {
    setVariable(ctx, '_', sourceValue);

    if (source.variable) {
      setVariable(ctx, source.variable, sourceValue);
    }

    if (index < rule.source.length - 1) {
      // If there are more sources, evaluate the next source
      evalRuleSourceAt(ctx, rule, index + 1);
    } else {
      // Otherwise, evaluate the rule after the sources
      evalRuleAfterSources(ctx, rule);
    }
  }
}

/**
 * Evaluates a rule after the sources have been evaluated.
 *
 * This includes the rule targets, child rules, and dependent groups.
 *
 * @param ctx - The transform context.
 * @param rule - The FHIR Mapping rule definition.
 * @internal
 */
function evalRuleAfterSources(ctx: TransformContext, rule: StructureMapGroupRule): void {
  if (tryEvalShorthandRule(ctx, rule)) {
    return;
  }
  if (rule.target) {
    for (const target of rule.target) {
      evalTarget(ctx, target);
    }
  }
  if (rule.rule) {
    for (const childRule of rule.rule) {
      evalRule(ctx, childRule);
    }
  }
  if (rule.dependent) {
    for (const dependent of rule.dependent) {
      evalDependent(ctx, dependent);
    }
  }
}

/**
 * Tries to evaluate a shorthand rule.
 * @param ctx - The transform context.
 * @param rule - The FHIR Mapping rule definition.
 * @returns True if the rule is a shorthand rule, false otherwise.
 */
function tryEvalShorthandRule(ctx: TransformContext, rule: StructureMapGroupRule): boolean {
  // First, check if this is actually a shorthand rule
  // Shorthand rule has exactly one target, no transform, no rule, and no dependent
  if (!rule.target || rule.target.length !== 1 || rule.target[0].transform || rule.rule || rule.dependent) {
    return false;
  }

  // Determine the source value
  let sourceValue = getVariable(ctx, '_');
  if (Array.isArray(sourceValue)) {
    sourceValue = sourceValue[0];
  }
  if (!sourceValue) {
    return false;
  }

  // Ok, this is a shorthand rule.
  // Next, try to find a "types" group that matches the input and output types
  const group = tryFindTypesGroup(ctx, rule);
  if (!group) {
    // No group found, fallback to simple copy transform
    // This is commonly used for primitive types such as "string" and "code"
    evalTarget(ctx, { ...rule.target[0], transform: 'copy', parameter: [{ valueId: '_' }] });
    return true;
  }

  const target = rule.target[0];
  const targetContext = getVariable(ctx, target.context as string) as TypedValue;
  const originalValue = targetContext.value[target.element as string];
  const isArray = isArrayProperty(targetContext, target.element as string) || Array.isArray(originalValue);
  const newContext: TransformContext = { root: ctx.root, parent: ctx, variables: {} };
  const targetValue = evalGroup(newContext, group, [sourceValue]);
  setTargetValue(ctx, target, targetContext, targetValue, isArray, originalValue);
  return true;
}

/**
 * Tries to find a "types" group that matches the input and output types.
 * This is used to determine the transform for a shorthand rule.
 * @param ctx - The transform context.
 * @param _rule - The FHIR Mapping rule definition.
 * @returns The matching group, if found; otherwise, undefined.
 */
function tryFindTypesGroup(ctx: TransformContext, _rule: StructureMapGroupRule): StructureMapGroup | undefined {
  let sourceValue = getVariable(ctx, '_');
  if (Array.isArray(sourceValue)) {
    sourceValue = sourceValue[0];
  }
  if (!sourceValue) {
    return undefined;
  }

  let sourceType = sourceValue.type;
  if (sourceType.includes('/')) {
    // Source type can be a URL, so we need to extract the last part
    sourceType = sourceType.split('/').pop() as string;
  }

  let currentContext: TransformContext | undefined = ctx;
  while (currentContext) {
    if (currentContext.variables) {
      for (const value of Object.values(currentContext.variables)) {
        const array = arrayify(value);
        for (const entry of array) {
          if (entry.type === 'StructureMapGroup') {
            const group = entry.value as StructureMapGroup;
            if (
              (group.typeMode === 'types' || group.typeMode === 'type-and-types') &&
              group.input.length === 2 &&
              group.input[0].mode === 'source' &&
              group.input[0].type === sourceType &&
              group.input[1].mode === 'target'
            ) {
              return group;
            }
          }
        }
      }
    }
    currentContext = currentContext.parent;
  }

  return undefined;
}

/**
 * Evaluates a FHIR Mapping source definition.
 *
 * If the source has a condition, the condition is evaluated.
 * If the source has a check, the check is evaluated.
 *
 * @param ctx - The transform context.
 * @param source - The FHIR Mapping source definition.
 * @returns The evaluated source values.
 * @internal
 */
function evalSource(ctx: TransformContext, source: StructureMapGroupRuleSource): TypedValue[] {
  const sourceContext = getVariable(ctx, source.context as string) as TypedValue | undefined;
  if (!sourceContext) {
    return [];
  }

  const sourceElement = source.element;
  if (!sourceElement) {
    return [sourceContext];
  }

  let sourceValue = evalFhirPathTyped(sourceElement, [sourceContext]);
  if (!sourceValue || sourceValue.length === 0) {
    return [];
  }

  if (source.condition) {
    if (!evalCondition(sourceContext, { [source.variable as string]: sourceValue[0] }, source.condition)) {
      return [];
    }
  }

  if (source.check) {
    if (!evalCondition(sourceContext, { [source.variable as string]: sourceValue[0] }, source.check)) {
      throw new Error('Check failed: ' + source.check);
    }
  }

  if (source.listMode) {
    sourceValue = evalListMode(source, sourceValue);
  }

  return sourceValue;
}

/**
 * Evaluates a FHIRPath condition for a FHIR Mapping source.
 *
 * This is used for both the "condition" and "check" properties.
 *
 * @param input - The input value, typically the rule source.
 * @param variables - The variables in scope for the FHIRPath expression.
 * @param condition - The FHIRPath condition to evaluate.
 * @returns True if the condition is true, false otherwise.
 * @internal
 */
function evalCondition(input: TypedValue, variables: Record<string, TypedValue>, condition: string): boolean {
  return toJsBoolean(evalFhirPathTyped(condition, [input], variables));
}

/**
 * Evaluates the list mode for a FHIR Mapping source.
 *
 * @param source - The FHIR Mapping source definition.
 * @param sourceValue - The source values.
 * @returns The evaluated source values.
 * @internal
 */
function evalListMode(source: StructureMapGroupRuleSource, sourceValue: TypedValue[]): TypedValue[] {
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (source.listMode) {
    case 'first':
      return [sourceValue[0]];
    case 'not_first':
      return sourceValue.slice(1);
    case 'last':
      return [sourceValue[sourceValue.length - 1]];
    case 'not_last':
      return sourceValue.slice(0, sourceValue.length - 1);
    case 'only_one':
      if (sourceValue.length !== 1) {
        throw new Error('Expected only one value');
      }
      break;
  }
  return sourceValue;
}

/**
 * Evaluates a FHIR Mapping target definition.
 *
 * @param ctx - The transform context.
 * @param target - The FHIR Mapping target definition.
 * @internal
 */
function evalTarget(ctx: TransformContext, target: StructureMapGroupRuleTarget): void {
  const targetContext = getVariable(ctx, target.context as string) as TypedValue | undefined;
  if (!targetContext) {
    throw new Error('Target not found: ' + target.context);
  }

  const originalValue = targetContext.value[target.element as string];
  let targetValue: TypedValue[];

  // Determine if the target property is an array field or not
  // If the target property is an array, then we need to append to the array
  const isArray = isArrayProperty(targetContext, target.element as string) || Array.isArray(originalValue);

  if (!target.transform) {
    const elementTypes = tryGetPropertySchema(targetContext, target.element as string)?.type;
    const elementType = elementTypes?.length === 1 ? elementTypes[0].code : undefined;
    if (isArray || originalValue === undefined) {
      targetValue = [elementType ? { type: elementType, value: {} } : toTypedValue({})];
    } else {
      targetValue = [elementType ? { type: elementType, value: originalValue } : toTypedValue(originalValue)];
    }
  } else {
    switch (target.transform) {
      case 'append':
        targetValue = evalAppend(ctx, target);
        break;
      case 'copy':
        targetValue = evalCopy(ctx, target);
        break;
      case 'create':
        targetValue = evalCreate(ctx, target);
        break;
      case 'evaluate':
        targetValue = evalEvaluate(ctx, target);
        break;
      case 'translate':
        targetValue = evalTranslate(ctx, target);
        break;
      case 'truncate':
        targetValue = evalTruncate(ctx, target);
        break;
      case 'uuid':
        targetValue = [{ type: 'string', value: generateId() }];
        break;
      default:
        throw new Error(`Unsupported transform: ${target.transform}`);
    }
  }

  setTargetValue(ctx, target, targetContext, targetValue, isArray, originalValue);
}

/**
 * Sets a target value.
 *
 * @param ctx - The transform context.
 * @param target - The FHIR Mapping target definition.
 * @param targetContext - The target context.
 * @param targetValue - The target value.
 * @param isArray - True if the target property is an array field.
 * @param originalValue - The original value of the target property.
 * @internal
 */
function setTargetValue(
  ctx: TransformContext,
  target: StructureMapGroupRuleTarget,
  targetContext: TypedValue,
  targetValue: TypedValue[],
  isArray: boolean,
  originalValue: any
): void {
  if (targetValue.length === 0) {
    return;
  }

  if (isArray) {
    if (!originalValue) {
      originalValue = [];
      safeAssign(targetContext.value, target.element as string, originalValue);
    }
    for (const el of targetValue) {
      originalValue.push(el.value);
    }
  } else {
    safeAssign(targetContext.value, target.element as string, targetValue[0].value);
  }

  if (target.variable) {
    setVariable(ctx, target.variable, unarrayify(targetValue));
  }
}

/**
 * Returns true if the target property is an array field.
 *
 * @param targetContext - The target context.
 * @param element - The element to check (i.e., the property name).
 * @returns True if the target property is an array field.
 * @internal
 */
function isArrayProperty(targetContext: TypedValue, element: string): boolean | undefined {
  return tryGetPropertySchema(targetContext, element)?.isArray;
}

/**
 * Returns the type schema
 * @param targetContext - The target context.
 * @param element - The element to check (i.e., the property name).
 * @returns the type schema for the target element, if it is loeaded
 * @internal
 */
function tryGetPropertySchema(targetContext: TypedValue, element: string): InternalSchemaElement | undefined {
  return tryGetDataType(targetContext.type)?.elements?.[element];
}

/**
 * Evaluates the "append" transform.
 *
 * "Source is element or string - just append them all together"
 *
 * See: https://build.fhir.org/mapping-language.html#7.8.0.8.2
 *
 * @param ctx - The transform context.
 * @param target - The FHIR Mapping target definition.
 * @returns The evaluated target values.
 * @internal
 */
function evalAppend(ctx: TransformContext, target: StructureMapGroupRuleTarget): TypedValue[] {
  const arg1 = resolveParameter(ctx, target.parameter?.[0])?.[0]?.value;
  const arg2 = resolveParameter(ctx, target.parameter?.[1])?.[0]?.value;
  return [{ type: 'string', value: (arg1 ?? '').toString() + (arg2 ?? '').toString() }];
}

/**
 * Evaluates the "copy" transform.
 *
 * "Simply copy the source to the target as is (only allowed when the types in source and target match- typically for primitive types).
 * In the concrete syntax, this is simply represented as the source variable, e.g. src.a = tgt.b"
 *
 * See: https://build.fhir.org/mapping-language.html#7.8.0.8.2
 *
 * @param ctx - The transform context.
 * @param target - The FHIR Mapping target definition.
 * @returns The evaluated target values.
 * @internal
 */
function evalCopy(ctx: TransformContext, target: StructureMapGroupRuleTarget): TypedValue[] {
  return (target.parameter as StructureMapGroupRuleTargetParameter[]).flatMap((p) => resolveParameter(ctx, p));
}

/**
 * Evaluates the "create" transform.
 *
 * "Use the standard API to create a new instance of data.
 * Where structure definitions have been provided, the type parameter must be a string which is a known type of a root element.
 * Where they haven't, the application must know the name somehow.""
 *
 * See: https://build.fhir.org/mapping-language.html#7.8.0.8.2
 *
 * @param ctx - The transform context.
 * @param target - The FHIR Mapping target definition.
 * @returns The evaluated target values.
 * @internal
 */
function evalCreate(ctx: TransformContext, target: StructureMapGroupRuleTarget): TypedValue[] {
  const result: Record<string, unknown> = {};
  if (target.parameter && target.parameter.length > 0) {
    result.resourceType = resolveParameter(ctx, target.parameter?.[0])?.[0]?.value;
  }
  return [toTypedValue(result)];
}

/**
 * Evaluates the "evaluate" transform.
 *
 * "Execute the supplied FHIRPath expression and use the value returned by that."
 *
 * See: https://build.fhir.org/mapping-language.html#7.8.0.8.2
 *
 * @param ctx - The transform context.
 * @param target - The FHIR Mapping target definition.
 * @returns The evaluated target values.
 * @internal
 */
function evalEvaluate(ctx: TransformContext, target: StructureMapGroupRuleTarget): TypedValue[] {
  const typedExpr = resolveParameter(ctx, target.parameter?.[0]);
  const expr = typedExpr[0].value as string;
  return evalFhirPathTyped(expr, [], buildFhirPathVariables(ctx) as Record<string, TypedValue>);
}

/**
 * Evaluates the "translate" transform.
 *
 * "Use the translate operation. The source is some type of code or coded datatype,
 * and the source and map_uri are passed to the translate operation.
 * The output determines what value from the translate operation is used for the result of the operation
 * (code, system, display, Coding, or CodeableConcept)"
 *
 * See: https://build.fhir.org/mapping-language.html#7.8.0.8.2
 *
 * @param ctx - The transform context.
 * @param target - The FHIR Mapping target definition.
 * @returns The evaluated target values.
 * @internal
 */
function evalTranslate(ctx: TransformContext, target: StructureMapGroupRuleTarget): TypedValue[] {
  const args = (target.parameter as StructureMapGroupRuleTargetParameter[]).flatMap((p) => resolveParameter(ctx, p));
  const sourceValue = args[0].value;
  const mapUri = args[1].value;
  const conceptMap = ctx.root.contained?.find((r) => r.resourceType === 'ConceptMap' && r.url === mapUri) as ConceptMap;
  // TODO: Verify whether system is actually required
  // The FHIR Mapping Language spec does not say whether it is required
  // But our current implementation requires it
  const result = conceptMapTranslate(conceptMap, { system: conceptMap.group?.[0]?.source, code: sourceValue });
  return [toTypedValue(result.match?.[0]?.concept?.code)];
}

/**
 * Evaluates the "truncate" transform.
 *
 * "Source must be some stringy type that has some meaningful length property"
 *
 * See: https://build.fhir.org/mapping-language.html#7.8.0.8.2
 *
 * @param ctx - The transform context.
 * @param target - The FHIR Mapping target definition.
 * @returns The evaluated target values.
 * @internal
 */
function evalTruncate(ctx: TransformContext, target: StructureMapGroupRuleTarget): TypedValue[] {
  const targetValue = resolveParameter(ctx, target.parameter?.[0])?.[0];
  const targetLength = resolveParameter(ctx, target.parameter?.[1])?.[0]?.value as number;
  if (targetValue.type === 'string') {
    return [{ type: 'string', value: targetValue.value.substring(0, targetLength) }];
  }
  return [targetValue];
}

/**
 * Evaluates a rule dependent group.
 *
 * See: https://hl7.org/fhir/r4/structuremap-definitions.html#StructureMap.group.rule.dependent
 *
 * @param ctx - The transform context.
 * @param dependent - The FHIR Mapping dependent definition.
 * @internal
 */
function evalDependent(ctx: TransformContext, dependent: StructureMapGroupRuleDependent): void {
  const dependentGroup = getVariable(ctx, dependent.name as string) as TypedValue | undefined;
  if (!dependentGroup) {
    throw new Error('Dependent group not found: ' + dependent.name);
  }

  const variables = dependent.variable as string[];
  const args: TypedValue[] = [];
  for (const variable of variables) {
    const variableValue = getVariable(ctx, variable) as TypedValue | undefined;
    if (!variableValue) {
      throw new Error('Dependent variable not found: ' + variable);
    }
    args.push(variableValue);
  }

  const newContext: TransformContext = { root: ctx.root, parent: ctx, variables: {} };
  evalGroup(newContext, dependentGroup.value as StructureMapGroup, args);
}

/**
 * Resolves the value of a FHIR Mapping target parameter.
 *
 * For literal values, the value is returned as-is.
 *
 * For variables, the value is looked up in the current context.
 *
 * @param ctx - The transform context.
 * @param parameter - The FHIR Mapping target parameter definition.
 * @returns The resolved parameter values.
 * @internal
 */
function resolveParameter(
  ctx: TransformContext,
  parameter: StructureMapGroupRuleTargetParameter | undefined
): TypedValue[] {
  const typedParameter = { type: 'StructureMapGroupRuleTargetParameter', value: parameter };
  let paramValue = getTypedPropertyValue(typedParameter, 'value');
  if (!paramValue) {
    throw new Error('Missing target parameter: ' + JSON.stringify(parameter));
  }

  paramValue = arrayify(paramValue);

  if (paramValue.length === 1 && paramValue[0].type === 'id') {
    const variableValue = getVariable(ctx, paramValue[0].value as string);
    if (!variableValue) {
      throw new Error('Variable not found: ' + paramValue[0].value);
    }
    return arrayify(variableValue);
  }

  return paramValue;
}

/**
 * Returns a variable value by name.
 *
 * Recursively searches the parent context if the variable is not found in the current context.
 *
 * @param ctx - The transform context.
 * @param name - The variable name.
 * @returns The variable value.
 * @internal
 */
function getVariable(ctx: TransformContext, name: string): TypedValue[] | TypedValue | undefined {
  const value = ctx.variables?.[name];
  if (value) {
    return value;
  }
  if (ctx.parent) {
    return getVariable(ctx.parent, name);
  }
  return undefined;
}

/**
 * Builds a collection of FHIRPath variables from the current context.
 *
 * Recursively searches the parent context to build the complete set of variables.
 *
 * @param ctx - The transform context.
 * @param result - The builder output.
 * @returns The result with the FHIRPath variables.
 * @internal
 */
function buildFhirPathVariables(
  ctx: TransformContext,
  result: Record<string, TypedValue[] | TypedValue> = {}
): Record<string, TypedValue[] | TypedValue> {
  if (ctx.parent) {
    buildFhirPathVariables(ctx.parent, result);
  }
  if (ctx.variables) {
    for (const [key, value] of Object.entries(ctx.variables)) {
      result[key] = value;
      result['%' + key] = value;
    }
  }
  return result;
}

/**
 * Sets a variable value in the current context.
 *
 * @param ctx - The transform context.
 * @param name - The variable name.
 * @param value - The variable value.
 * @internal
 */
function setVariable(ctx: TransformContext, name: string, value: TypedValue[] | TypedValue): void {
  if (!ctx.variables) {
    ctx.variables = {};
  }
  safeAssign(ctx.variables, name, value);
}

function safeAssign(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    throw new Error('Invalid key: ' + key);
  }
  target[key] = value;
}

function arrayify<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function unarrayify<T>(value: T[]): T | T[] {
  return value.length === 1 ? value[0] : value;
}
