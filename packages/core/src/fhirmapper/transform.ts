import {
  StructureMap,
  StructureMapGroup,
  StructureMapGroupInput,
  StructureMapGroupRule,
  StructureMapGroupRuleSource,
  StructureMapGroupRuleTarget,
} from '@medplum/fhirtypes';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { getTypedPropertyValue, toJsBoolean, toTypedValue } from '../fhirpath/utils';

interface TransformContext {
  parent?: TransformContext;
  variables?: Record<string, any>;
}

export function structureMapTransform(structureMap: StructureMap, input: any): any {
  return evalStructureMap({}, structureMap, input);
}

function evalStructureMap(ctx: TransformContext, structureMap: StructureMap, input: any): any {
  const groups = structureMap.group as StructureMapGroup[];
  for (const group of groups) {
    input = evalGroup(ctx, group, input);
  }
  return input;
}

function evalGroup(ctx: TransformContext, group: StructureMapGroup, input: any): any {
  let sourceInput = undefined;
  let targetInput = undefined;

  for (const input of group.input as StructureMapGroupInput[]) {
    if (input.mode === 'source') {
      sourceInput = input;
    }
    if (input.mode === 'target') {
      targetInput = input;
    }
  }

  if (!sourceInput) {
    throw new Error('Missing source input');
  }

  if (!targetInput) {
    throw new Error('Missing target input');
  }

  const variables: Record<string, any> = {};
  const result = {};

  if (sourceInput) {
    variables[sourceInput.name as string] = input;
  }

  if (targetInput) {
    variables[targetInput.name as string] = result;
  }

  const newContext: TransformContext = { parent: ctx, variables };

  for (const rule of group.rule as StructureMapGroupRule[]) {
    evalRule(newContext, rule);
  }

  return result;
}

function evalRule(ctx: TransformContext, rule: StructureMapGroupRule): void {
  for (const source of rule.source as StructureMapGroupRuleSource[]) {
    evalSource(ctx, source);
  }
  for (const target of rule.target as StructureMapGroupRuleTarget[]) {
    evalTarget(ctx, target);
  }
}

function evalSource(ctx: TransformContext, source: StructureMapGroupRuleSource): void {
  const sourceContext = getVariable(ctx, source.context as string);
  const sourceElement = source.element as string;
  const sourceValue = evalFhirPathTyped(sourceElement, [toTypedValue(sourceContext)]);
  if (!sourceValue || sourceValue.length === 0) {
    return;
  }

  if (source.condition) {
    const conditionExpression = source.condition as string;
    const conditionInput = [toTypedValue(sourceContext)];
    const conditionVariables = { [source.variable as string]: sourceValue[0] };
    const conditionResult = evalFhirPathTyped(conditionExpression, conditionInput, conditionVariables);
    if (!toJsBoolean(conditionResult)) {
      return;
    }
  }

  if (source.check) {
    const checkExpression = source.check as string;
    const checkInput = [toTypedValue(sourceContext)];
    const checkVariables = { [source.variable as string]: sourceValue[0] };
    const checkResult = evalFhirPathTyped(checkExpression, checkInput, checkVariables);
    if (!toJsBoolean(checkResult)) {
      throw new Error('Check failed: ' + checkExpression);
    }
  }

  if (!ctx.variables) {
    ctx.variables = {};
  }

  ctx.variables[source.variable as string] = sourceValue[0].value;
}

function evalTarget(ctx: TransformContext, target: StructureMapGroupRuleTarget): void {
  switch (target.transform as string) {
    case 'copy':
      evalCopy(ctx, target);
      break;
    case 'truncate':
      evalTruncate(ctx, target);
      break;
    default:
      throw new Error('Unsupported transform: ' + target.transform);
  }
}

function evalCopy(ctx: TransformContext, target: StructureMapGroupRuleTarget): void {
  const targetContext = getVariable(ctx, target.context as string);
  const targetElement = target.element as string;
  let targetParameter = getTypedPropertyValue(
    { type: 'StructureMapGroupRuleTargetParameter', value: target.parameter?.[0] },
    'value'
  );
  if (Array.isArray(targetParameter)) {
    targetParameter = targetParameter[0];
  }
  if (!targetParameter) {
    return;
  }
  let targetValue = targetParameter.value;
  if (targetParameter.type === 'id') {
    targetValue = getVariable(ctx, targetParameter.value as string);
  }
  targetContext[targetElement] = targetValue;
}

function evalTruncate(ctx: TransformContext, target: StructureMapGroupRuleTarget): void {
  const targetContext = getVariable(ctx, target.context as string);
  const targetElement = target.element as string;
  let targetValue = getVariable(ctx, target.parameter?.[0]?.valueId as string);
  const targetLength = target.parameter?.[1]?.valueInteger as number;
  if (targetValue && typeof targetValue === 'string') {
    targetValue = targetValue.substring(0, targetLength);
  }
  targetContext[targetElement] = targetValue;
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
