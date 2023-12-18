import {
  StructureMap,
  StructureMapGroup,
  StructureMapGroupInput,
  StructureMapGroupRule,
  StructureMapGroupRuleDependent,
  StructureMapGroupRuleSource,
  StructureMapGroupRuleTarget,
} from '@medplum/fhirtypes';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { getTypedPropertyValue, toJsBoolean, toTypedValue } from '../fhirpath/utils';
import { TypedValue } from '../types';

interface TransformContext {
  parent?: TransformContext;
  variables?: Record<string, any>;
}

export function structureMapTransform(structureMap: StructureMap, input: any[]): any[] {
  return evalStructureMap({}, structureMap, input);
}

function evalStructureMap(ctx: TransformContext, structureMap: StructureMap, input: any[]): any[] {
  const groups = structureMap.group as StructureMapGroup[];

  // Hoist groups by name
  for (const group of groups) {
    setVariable(ctx, group.name as string, group);
  }

  // Only execute the first group - other groups can be called by name
  return evalGroup(ctx, groups[0], input);
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
  if (rule.source) {
    for (const source of rule.source) {
      evalSource(ctx, source);
    }
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

function evalSource(ctx: TransformContext, source: StructureMapGroupRuleSource): void {
  const sourceContext = getVariable(ctx, source.context as string);
  const sourceElement = source.element;
  if (!sourceElement) {
    return;
  }

  const sourceValue = evalFhirPathTyped(sourceElement, [toTypedValue(sourceContext)]);
  if (!sourceValue || sourceValue.length === 0) {
    return;
  }

  if (source.condition) {
    if (!evalCondition(sourceContext, { [source.variable as string]: sourceValue[0] }, source.condition)) {
      return;
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
}

function evalCondition(input: any, variables: Record<string, TypedValue>, condition: string): boolean {
  return toJsBoolean(evalFhirPathTyped(condition, [toTypedValue(input)], variables));
}

function evalTarget(ctx: TransformContext, target: StructureMapGroupRuleTarget): void {
  const targetContext = getVariable(ctx, target.context as string);
  if (!targetContext) {
    throw new Error('Target not found: ' + target.context);
  }

  let targetValue;

  if (!target.transform) {
    targetValue = {};
    safeAssign(targetContext, target.element as string, targetValue);
  } else {
    switch (target.transform) {
      case 'copy':
        targetValue = evalCopy(ctx, target, targetContext);
        break;
      case 'truncate':
        targetValue = evalTruncate(ctx, target, targetContext);
        break;
      default:
        console.warn('Unsupported transform: ' + target.transform);
    }
  }

  if (target.variable) {
    setVariable(ctx, target.variable, targetValue);
  }
}

function evalCopy(ctx: TransformContext, target: StructureMapGroupRuleTarget, targetContext: any): any {
  const targetElement = target.element as string;
  let targetParameter = getTypedPropertyValue(
    { type: 'StructureMapGroupRuleTargetParameter', value: target.parameter?.[0] },
    'value'
  );
  if (Array.isArray(targetParameter)) {
    targetParameter = targetParameter[0];
  }
  if (!targetParameter) {
    throw new Error('Missing target parameter: ' + targetElement);
  }
  let targetValue = targetParameter.value;
  if (targetParameter.type === 'id') {
    targetValue = getVariable(ctx, targetParameter.value as string);
  }
  safeAssign(targetContext, targetElement, targetValue);
  return targetValue;
}

function evalTruncate(ctx: TransformContext, target: StructureMapGroupRuleTarget, targetContext: any): any {
  const targetElement = target.element as string;
  let targetValue = getVariable(ctx, target.parameter?.[0]?.valueId as string);
  const targetLength = target.parameter?.[1]?.valueInteger as number;
  if (targetValue && typeof targetValue === 'string') {
    targetValue = targetValue.substring(0, targetLength);
  }
  safeAssign(targetContext, targetElement, targetValue);
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

  evalGroup(ctx, dependentGroup as StructureMapGroup, args);
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
