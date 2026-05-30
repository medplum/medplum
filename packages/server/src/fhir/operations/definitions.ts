// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { arrayify, OperationOutcomeError, serverError } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { Bundle, OperationDefinition, Parameters, ResourceType, StructureDefinition } from '@medplum/fhirtypes';

const operationDefinitions = (
  readJson('fhir/r4/profiles-resources.json') as Bundle<StructureDefinition | OperationDefinition>
).entry
  ?.filter((e) => e.resource?.resourceType === 'OperationDefinition')
  ?.map((e) => e.resource as OperationDefinition);

export function getOperationDefinition(resourceType: ResourceType, code: string): OperationDefinition {
  const opDef = operationDefinitions?.find((od) => od.resource?.includes(resourceType) && od.code === code);
  if (!opDef) {
    throw new OperationOutcomeError(serverError(new Error('OperationDefinition not found')));
  }
  return opDef;
}

type OperationDefinitionResource = ResourceType | ResourceType[];

export type OperationDefinitionScope =
  | { scope: 'system'; resource?: never }
  | { scope: 'type'; resource: OperationDefinitionResource }
  | { scope: 'instance'; resource: OperationDefinitionResource }
  | { scope: 'type-and-instance'; resource: OperationDefinitionResource };

export type MakeOperationDefinitionOptions = Omit<
  OperationDefinition,
  'resource' | 'resourceType' | 'kind' | 'status' | 'system' | 'type' | 'instance'
> & {
  kind?: OperationDefinition['kind']; // make kind optional since a default is provided
  status?: OperationDefinition['status']; // make status optional since a default is provided
};

/**
 * Creates an OperationDefinition resource from a given scope and partial OperationDefinition object.
 * The returned OperationDefinition will have the following properties set by default:
 * - status: 'active'
 * - kind: 'operation'
 * - experimental: true
 * The returned OperationDefinition will have the properties from the operation scope merged with the default properties.
 * @param operationScope - The scope of the operation definition.
 * @param options - The options for the operation definition.
 * @returns The OperationDefinition resource.
 */
export function makeOperationDefinition(
  operationScope: OperationDefinitionScope,
  options: MakeOperationDefinitionOptions
): OperationDefinition {
  const { status = 'active', kind = 'operation', experimental = true, ...operation } = options;

  return {
    resourceType: 'OperationDefinition',
    status,
    kind,
    experimental,
    ...operation,
    ...getOperationScopeFlags(operationScope.scope),
    resource: arrayify(operationScope.resource),
  };
}

const operationScopeFlags = {
  system: { system: true, type: false, instance: false },
  type: { system: false, type: true, instance: false },
  instance: { system: false, type: false, instance: true },
  'type-and-instance': { system: false, type: true, instance: true },
} satisfies Record<OperationDefinitionScope['scope'], Pick<OperationDefinition, 'system' | 'type' | 'instance'>>;

function getOperationScopeFlags(
  scope: OperationDefinitionScope['scope']
): Pick<OperationDefinition, 'system' | 'type' | 'instance'> {
  return operationScopeFlags[scope];
}

export function makeParameters(values: Record<string, string | boolean | undefined>): Parameters {
  const parameters: Parameters = { resourceType: 'Parameters', parameter: [] };
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) {
      continue;
    }
    parameters.parameter?.push(
      typeof value === 'boolean' ? { name, valueBoolean: value } : { name, valueString: value }
    );
  }
  return parameters;
}
