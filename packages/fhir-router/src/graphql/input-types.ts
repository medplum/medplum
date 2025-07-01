// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { InternalSchemaElement } from '@medplum/core';
import { capitalize, getDataType, isResourceType } from '@medplum/core';
import type { ElementDefinitionType, ResourceType } from '@medplum/fhirtypes';
import type { GraphQLInputFieldConfig, GraphQLInputFieldConfigMap, GraphQLInputType } from 'graphql';
import { GraphQLInputObjectType, GraphQLList, GraphQLNonNull, GraphQLString } from 'graphql';
import { typeCache } from './utils';

const inputTypeCache: Record<string, GraphQLInputType | undefined> = {
  ...typeCache,
};

export function getGraphQLInputType(inputType: string, nameSuffix: string): GraphQLInputType {
  const cacheKey = inputType + nameSuffix;
  let result = inputTypeCache[cacheKey];
  if (!result) {
    result = buildGraphQLInputType(inputType, nameSuffix);
    inputTypeCache[cacheKey] = result;
  }

  return result;
}

function buildGraphQLInputType(resourceType: string, nameSuffix: string): GraphQLInputType {
  const schema = getDataType(resourceType);
  return new GraphQLInputObjectType({
    name: resourceType + nameSuffix,
    description: schema.description,
    fields: () => buildGraphQLInputFields(resourceType as ResourceType, nameSuffix),
  });
}

function buildGraphQLInputFields(resourceType: ResourceType, nameSuffix: string): GraphQLInputFieldConfigMap {
  const fields: GraphQLInputFieldConfigMap = {};

  // Add resourceType field for root resource
  if (isResourceType(resourceType)) {
    const propertyFieldConfig: GraphQLInputFieldConfig = {
      description: 'The type of resource',
      type: GraphQLString,
    };
    fields['resourceType'] = propertyFieldConfig;
  }

  buildInputPropertyFields(resourceType, fields, nameSuffix);
  return fields;
}

function buildInputPropertyFields(resourceType: string, fields: GraphQLInputFieldConfigMap, nameSuffix: string): void {
  const schema = getDataType(resourceType);
  for (const [key, elementDefinition] of Object.entries(schema.elements)) {
    for (const type of elementDefinition.type as ElementDefinitionType[]) {
      buildInputPropertyField(fields, key, elementDefinition, type, nameSuffix);
    }
  }
}

function buildInputPropertyField(
  fields: GraphQLInputFieldConfigMap,
  key: string,
  elementDefinition: InternalSchemaElement,
  elementDefinitionType: ElementDefinitionType,
  nameSuffix: string
): void {
  let typeName = elementDefinitionType.code as string;
  if (typeName === 'Resource') {
    // GraphQL does not support union types on input, so bailing here
    // That means we do not support Resource.contained on GraphQL input
    return;
  }
  if (typeName === 'Element' || typeName === 'BackboneElement') {
    typeName = elementDefinition.type[0].code;
  }

  // Check if this is a primitive type that should be mapped to a GraphQL scalar
  const primitiveType = typeCache[typeName];
  if (primitiveType) {
    const fieldConfig: GraphQLInputFieldConfig = {
      description: elementDefinition.description, // TODO: elementDefinition.short
      type: primitiveType,
    };

    if (elementDefinition.max > 1) {
      fieldConfig.type = new GraphQLList(new GraphQLNonNull(primitiveType));
    }
    if (elementDefinition.min > 0 && !key.endsWith('[x]')) {
      fieldConfig.type = new GraphQLNonNull(fieldConfig.type);
    }

    const propertyName = (key.split('.').pop() as string).replace(
      '[x]',
      capitalize(elementDefinitionType.code as string)
    );
    fields[propertyName] = fieldConfig;
    return;
  }

  // For complex types, create input types
  const fieldConfig: GraphQLInputFieldConfig = {
    description: elementDefinition.description, // TODO: elementDefinition.short
    type: getGraphQLInputType(typeName, nameSuffix),
  };

  if (elementDefinition.max > 1) {
    fieldConfig.type = new GraphQLList(new GraphQLNonNull(getGraphQLInputType(typeName, nameSuffix)));
  }
  if (elementDefinition.min > 0 && !key.endsWith('[x]')) {
    fieldConfig.type = new GraphQLNonNull(fieldConfig.type);
  }

  const propertyName = (key.split('.').pop() as string).replace(
    '[x]',
    capitalize(elementDefinitionType.code as string)
  );
  fields[propertyName] = fieldConfig;
}
