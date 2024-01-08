import { InternalSchemaElement, capitalize, getDataType, isResourceType } from '@medplum/core';
import { ElementDefinitionType, ResourceType } from '@medplum/fhirtypes';
import {
  GraphQLInputFieldConfig,
  GraphQLInputFieldConfigMap,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLString,
} from 'graphql';
import { typeCache } from './utils';

const inputTypeCache: Record<string, GraphQLInputType | undefined> = {
  ...typeCache,
};

export function getGraphQLInputType(inputType: string, nameSuffix: string): GraphQLInputType {
  let result = inputTypeCache[inputType];
  if (!result) {
    result = buildGraphQLInputType(inputType, nameSuffix);
    inputTypeCache[inputType] = result;
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
