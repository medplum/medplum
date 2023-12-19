import {
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

interface TransformContext {
  loader?: (url: string) => StructureMap[];
  parent?: TransformContext;
  variables?: Record<string, any>;
}

export function structureMapTransform(
  structureMap: StructureMap,
  input: any[],
  loader?: (url: string) => StructureMap[]
): any[] {
  return evalStructureMap({ loader }, structureMap, input);
}

function evalStructureMap(ctx: TransformContext, structureMap: StructureMap, input: any[]): any[] {
  evalImports(ctx, structureMap);
  hoistGroups(ctx, structureMap);
  return evalGroup(ctx, (structureMap.group as StructureMapGroup[])[0], input);
}

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

function hoistGroups(ctx: TransformContext, structureMap: StructureMap): void {
  if (structureMap.group) {
    for (const group of structureMap.group) {
      setVariable(ctx, group.name as string, group);
    }
  }
}

function evalGroup(ctx: TransformContext, group: StructureMapGroup, input: any[]): any[] {
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

  const variables: Record<string, any> = {};
  const outputs = [];
  let inputIndex = 0;

  for (const sourceDefinition of sourceDefinitions) {
    safeAssign(variables, sourceDefinition.name as string, input[inputIndex++]);
  }

  for (const targetDefinition of targetDefinitions) {
    const output = input[inputIndex++] ?? {};
    safeAssign(variables, targetDefinition.name as string, output);
    outputs.push(output);
  }

  const newContext: TransformContext = { parent: ctx, variables };

  if (group.rule) {
    for (const rule of group.rule) {
      evalRule(newContext, rule);
    }
  }

  return outputs;
}

function evalRule(ctx: TransformContext, rule: StructureMapGroupRule): void {
  let haveSource = false;
  if (rule.source) {
    for (const source of rule.source) {
      if (evalSource(ctx, source)) {
        haveSource = true;
      }
    }
  }

  if (!haveSource) {
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

function evalSource(ctx: TransformContext, source: StructureMapGroupRuleSource): boolean {
  const sourceContext = getVariable(ctx, source.context as string);
  const sourceElement = source.element;
  if (!sourceElement) {
    return true;
  }

  const sourceValue = evalFhirPathTyped(sourceElement, [toTypedValue(sourceContext)]);
  if (!sourceValue || sourceValue.length === 0) {
    return false;
  }

  if (source.condition) {
    if (!evalCondition(sourceContext, { [source.variable as string]: sourceValue[0] }, source.condition)) {
      return false;
    }
  }

  if (source.check) {
    if (!evalCondition(sourceContext, { [source.variable as string]: sourceValue[0] }, source.check)) {
      throw new Error('Check failed: ' + source.check);
    }
  }

  if (source.variable) {
    setVariable(ctx, source.variable, sourceValue[0].value);
  }

  return true;
}

function evalCondition(input: any, variables: Record<string, TypedValue>, condition: string): boolean {
  return toJsBoolean(evalFhirPathTyped(condition, [toTypedValue(input)], variables));
}

function evalTarget(ctx: TransformContext, target: StructureMapGroupRuleTarget): void {
  const targetContext = getVariable(ctx, target.context as string);
  if (!targetContext) {
    throw new Error('Target not found: ' + target.context);
  }

  const originalValue = targetContext[target.element as string];
  let targetValue;

  if (!target.transform) {
    if (Array.isArray(originalValue) || originalValue === undefined) {
      targetValue = {};
    } else {
      targetValue = originalValue;
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
      case 'translate':
        // TODO: Implement
        targetValue = evalCopy(ctx, target);
        break;
      case 'truncate':
        targetValue = evalTruncate(ctx, target);
        break;
      case 'uuid':
        targetValue = generateId();
        break;
      default:
        console.warn(
          `Unsupported transform: ${target.transform} (context=${target.context} element=${target.element})`
        );
    }
  }

  if (Array.isArray(originalValue)) {
    originalValue.push(targetValue);
  } else {
    safeAssign(targetContext, target.element as string, targetValue);
  }

  if (target.variable) {
    setVariable(ctx, target.variable, targetValue);
  }
}

function evalAppend(ctx: TransformContext, target: StructureMapGroupRuleTarget): any {
  const arg1 = resolveParameter(ctx, target.parameter?.[0]) as string | undefined;
  const arg2 = resolveParameter(ctx, target.parameter?.[1]) as string | undefined;
  return (arg1 ?? '').toString() + (arg2 ?? '').toString();
}

function evalCopy(ctx: TransformContext, target: StructureMapGroupRuleTarget): any {
  return resolveParameter(ctx, target.parameter?.[0]);
}

function evalCreate(ctx: TransformContext, target: StructureMapGroupRuleTarget): any {
  const targetValue: Record<string, unknown> = {};
  if (target.parameter && target.parameter.length > 0) {
    targetValue.resourceType = resolveParameter(ctx, target.parameter?.[0]);
  }
  return targetValue;
}

function evalTruncate(ctx: TransformContext, target: StructureMapGroupRuleTarget): any {
  let targetValue = resolveParameter(ctx, target.parameter?.[0]) as string | undefined;
  const targetLength = resolveParameter(ctx, target.parameter?.[1]) as number;
  if (targetValue && typeof targetValue === 'string') {
    targetValue = targetValue.substring(0, targetLength);
  }
  return targetValue;
}

function evalDependent(ctx: TransformContext, dependent: StructureMapGroupRuleDependent): void {
  const dependentGroup = getVariable(ctx, dependent.name as string);
  if (!dependentGroup) {
    throw new Error('Dependent group not found: ' + dependent.name);
  }

  const variables = dependent.variable as string[];
  const args = [];
  for (const variable of variables) {
    args.push(getVariable(ctx, variable));
  }

  const newContext: TransformContext = { parent: ctx, variables: {} };
  evalGroup(newContext, dependentGroup as StructureMapGroup, args);
}

function resolveParameter(ctx: TransformContext, parameter: StructureMapGroupRuleTargetParameter | undefined): any {
  const typedParameter = { type: 'StructureMapGroupRuleTargetParameter', value: parameter };
  let paramValue = getTypedPropertyValue(typedParameter, 'value');

  if (Array.isArray(paramValue)) {
    paramValue = paramValue[0];
  }

  if (!paramValue) {
    throw new Error('Missing target parameter: ' + JSON.stringify(parameter));
  }

  let targetValue = paramValue.value;
  if (paramValue.type === 'id') {
    targetValue = getVariable(ctx, paramValue.value as string);
  }

  return targetValue;
}

function getVariable(ctx: TransformContext, name: string): any {
  const value = ctx.variables?.[name];
  if (value) {
    return value;
  }
  if (ctx.parent) {
    return getVariable(ctx.parent, name);
  }
  return undefined;
}

function setVariable(ctx: TransformContext, name: string, value: any): void {
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
