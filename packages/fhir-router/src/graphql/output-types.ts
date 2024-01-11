import {
  capitalize,
  evalFhirPathTyped,
  getDataType,
  getResourceTypes,
  getSearchParameters,
  InternalSchemaElement,
  isLowerCase,
  isReference,
  isResourceTypeSchema,
  normalizeOperationOutcome,
  OperationOutcomeError,
  toJsBoolean,
  toTypedValue,
  tryGetDataType,
} from '@medplum/core';
import { ElementDefinitionType, Resource, ResourceType } from '@medplum/fhirtypes';
import {
  GraphQLEnumType,
  GraphQLEnumValueConfigMap,
  GraphQLFieldConfig,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLResolveInfo,
  GraphQLString,
  GraphQLUnionType,
} from 'graphql';
import { buildSearchArgs, fhirParamToGraphQLField, GraphQLContext, resolveBySearch, typeCache } from './utils';

export const outputTypeCache: Record<string, GraphQLOutputType | undefined> = {
  ...typeCache,
};

export function getGraphQLOutputType(inputType: string): GraphQLOutputType {
  let result = outputTypeCache[inputType];
  if (!result) {
    result = buildGraphQLOutputType(inputType);
    outputTypeCache[inputType] = result;
  }
  return result;
}

export function buildGraphQLOutputType(resourceType: string): GraphQLOutputType {
  if (resourceType === 'ResourceList') {
    return new GraphQLUnionType({
      name: 'ResourceList',
      types: () =>
        getResourceTypes()
          .map(getGraphQLOutputType)
          .filter((t) => !!t) as GraphQLObjectType[],
      resolveType: resolveTypeByReference,
    });
  }

  const schema = getDataType(resourceType);
  return new GraphQLObjectType({
    name: resourceType,
    description: schema.description,
    fields: () => buildGraphQLOutputFields(resourceType as ResourceType),
  });
}

function buildGraphQLOutputFields(resourceType: ResourceType): GraphQLFieldConfigMap<any, any> {
  const fields: GraphQLFieldConfigMap<any, any> = {};
  buildOutputPropertyFields(resourceType, fields);
  buildReverseLookupFields(resourceType, fields);
  return fields;
}

function buildOutputPropertyFields(resourceType: string, fields: GraphQLFieldConfigMap<any, any>): void {
  const schema = getDataType(resourceType);

  if (isResourceTypeSchema(schema)) {
    fields.resourceType = {
      type: new GraphQLNonNull(GraphQLString),
      description: 'Resource Type',
    };
  }

  if (resourceType === 'Reference') {
    fields.resource = {
      description: 'Reference',
      type: getGraphQLOutputType('ResourceList'),
      resolve: resolveByReference,
    };
  }

  for (const [key, elementDefinition] of Object.entries(schema.elements)) {
    for (const type of elementDefinition.type as ElementDefinitionType[]) {
      buildOutputPropertyField(fields, key, elementDefinition, type);
    }
  }
}

function buildOutputPropertyField(
  fields: GraphQLFieldConfigMap<any, any>,
  key: string,
  elementDefinition: InternalSchemaElement,
  elementDefinitionType: ElementDefinitionType
): void {
  let typeName = elementDefinitionType.code as string;
  if (typeName === 'Element' || typeName === 'BackboneElement') {
    typeName = elementDefinition.type[0].code;
  }
  if (typeName === 'Resource') {
    typeName = 'ResourceList';
  }

  const fieldConfig: GraphQLFieldConfig<any, any> = {
    description: elementDefinition.description, // TODO: elementDefinition.short
    type: getOutputPropertyType(elementDefinition, typeName, key),
    resolve: resolveField,
  };

  if (elementDefinition.max > 1) {
    fieldConfig.args = buildListPropertyFieldArgs(typeName);
  }

  const propertyName = (key.split('.').pop() as string).replace(
    '[x]',
    capitalize(elementDefinitionType.code as string)
  );
  fields[propertyName] = fieldConfig;
}

/**
 * Builds field arguments for a list property.
 *
 * The FHIR GraphQL specification defines the following arguments for list properties:
 *   1. _count: Specify how many elements to return from a repeating list.
 *   2. _offset: Specify the offset to start at for a repeating element.
 *   3. fhirpath: A FHIRPath statement selecting which of the subnodes is to be included.
 *   4. All properties of the list element type.
 *
 * See: https://hl7.org/fhir/R4/graphql.html#list
 * @param fieldTypeName - The type name of the field.
 * @returns The arguments for the field.
 */
function buildListPropertyFieldArgs(fieldTypeName: string): GraphQLFieldConfigArgumentMap {
  const fieldArgs: GraphQLFieldConfigArgumentMap = {
    _count: {
      type: GraphQLInt,
      description: 'Specify how many elements to return from a repeating list.',
    },
    _offset: {
      type: GraphQLInt,
      description: 'Specify the offset to start at for a repeating element.',
    },
  };

  if (!isLowerCase(fieldTypeName.charAt(0))) {
    // If this is a backbone element, add "fhirpath" and all properties as arguments
    fieldArgs.fhirpath = {
      type: GraphQLString,
      description: 'A FHIRPath statement selecting which of the subnodes is to be included',
    };

    // Add all "string" and "code" properties as arguments
    const fieldTypeSchema = tryGetDataType(fieldTypeName);
    if (fieldTypeSchema?.elements) {
      for (const [fieldKey, fieldElementDefinition] of Object.entries(fieldTypeSchema.elements)) {
        for (const type of fieldElementDefinition.type) {
          buildListPropertyFieldArg(fieldArgs, fieldKey, fieldElementDefinition, type);
        }
      }
    }
  }

  return fieldArgs;
}

/**
 * Builds a field argument for a list property.
 * @param fieldArgs - The output argument map.
 * @param fieldKey - The key of the field.
 * @param elementDefinition - The FHIR element definition of the field.
 * @param elementDefinitionType - The FHIR element definition type of the field.
 */
function buildListPropertyFieldArg(
  fieldArgs: GraphQLFieldConfigArgumentMap,
  fieldKey: string,
  elementDefinition: InternalSchemaElement,
  elementDefinitionType: ElementDefinitionType
): void {
  const baseType = elementDefinitionType.code as string;
  const fieldName = fieldKey.replace('[x]', capitalize(baseType));
  switch (baseType) {
    case 'canonical':
    case 'code':
    case 'id':
    case 'oid':
    case 'string':
    case 'uri':
    case 'url':
    case 'uuid':
    case 'http://hl7.org/fhirpath/System.String':
      fieldArgs[fieldName] = {
        type: GraphQLString,
        description: elementDefinition.description, // TODO: elementDefinition.short
      };
      break;
  }
}

/**
 * Builds a list of reverse lookup fields for a resource type.
 *
 * It's also possible to use search is a special mode, doing reverse lookups -
 * e.g. list all the resources that refer to this resource.
 *
 * An example of this use is to look up a patient,
 * and also retrieve all the Condition resources for the patient.
 *
 * This is a special case of search, above, but with an additional mandatory parameter _reference. For example:
 *
 * {
 *   name { [some fields] }
 *   ConditionList(_reference: patient) {
 *     [some fields from Condition]
 *   }
 * }
 *
 * There must be at least the argument "_reference" which identifies which of the search parameters
 * for the target resource is used to match the resource that has focus.
 * In addition, there may be other arguments as defined above in search
 * (except that the "id" argument is prohibited here as nonsensical).
 *
 * See: https://www.hl7.org/fhir/graphql.html#reverse
 * @param resourceType - The resource type to build fields for.
 * @param fields - The fields object to add fields to.
 */
function buildReverseLookupFields(resourceType: ResourceType, fields: GraphQLFieldConfigMap<any, any>): void {
  for (const childResourceType of getResourceTypes()) {
    const childGraphQLType = getGraphQLOutputType(childResourceType);
    const childSearchParams = getSearchParameters(childResourceType);
    const enumValues: GraphQLEnumValueConfigMap = {};
    let count = 0;
    if (childSearchParams) {
      for (const [code, searchParam] of Object.entries(childSearchParams)) {
        if (searchParam.target?.includes(resourceType)) {
          enumValues[fhirParamToGraphQLField(code)] = { value: code };
          count++;
        }
      }
    }

    if (count > 0) {
      const enumType = new GraphQLEnumType({
        name: resourceType + '_' + childResourceType + '_reference',
        values: enumValues,
      });
      const args = buildSearchArgs(childResourceType);
      args['_reference'] = {
        type: new GraphQLNonNull(enumType),
        description: `Specify which property to use for reverse lookup for ${childResourceType}`,
      };
      fields[childResourceType + 'List'] = {
        type: new GraphQLList(childGraphQLType),
        args,
        resolve: resolveBySearch,
      };
    }
  }
}

function getOutputPropertyType(
  elementDefinition: InternalSchemaElement,
  typeName: string,
  path: string
): GraphQLOutputType {
  let graphqlType = getGraphQLOutputType(typeName);
  if (elementDefinition.max > 1) {
    graphqlType = new GraphQLList(new GraphQLNonNull(graphqlType));
  }
  if (elementDefinition.min !== 0 && !path.endsWith('[x]')) {
    graphqlType = new GraphQLNonNull(graphqlType);
  }
  return graphqlType;
}

/**
 * GraphQL resolver for fields.
 * In the common case, this is just a matter of returning the field value from the source object.
 * If the field is a list and the user specifies list arguments, then we can apply those arguments here.
 * @param source - The source. This is the object that contains the field.
 * @param args - The GraphQL search arguments.
 * @param _ctx - The GraphQL context.
 * @param info - The GraphQL resolve info.  This includes the field name.
 * @returns Promise to read the resoure for the query.
 */
async function resolveField(source: any, args: any, _ctx: GraphQLContext, info: GraphQLResolveInfo): Promise<any> {
  const fieldValue = source?.[info.fieldName];
  if (!args || !fieldValue) {
    return fieldValue;
  }

  const { _offset, _count, fhirpath, ...rest } = args;
  let array = fieldValue as any[];

  for (const [key, value] of Object.entries(rest)) {
    array = array.filter((item) => item[key] === value);
  }

  if (fhirpath) {
    array = array.filter((item) => toJsBoolean(evalFhirPathTyped(fhirpath, [toTypedValue(item)])));
  }

  if (_offset) {
    array = array.slice(_offset);
  }

  if (_count) {
    array = array.slice(0, _count);
  }

  return array;
}

/**
 * GraphQL data loader for Reference requests.
 * This is a special data loader for following Reference objects.
 * @param source - The source/root.  This should always be null for our top level readers.
 * @param _args - The GraphQL search arguments.
 * @param ctx - The GraphQL context.
 * @returns Promise to read the resoure(s) for the query.
 */
async function resolveByReference(source: any, _args: any, ctx: GraphQLContext): Promise<Resource | undefined> {
  if (!isReference(source)) {
    return undefined;
  }
  try {
    return await ctx.dataLoader.load(source);
  } catch (err) {
    throw new OperationOutcomeError(normalizeOperationOutcome(err), err);
  }
}

/**
 * GraphQL type resolver for resources.
 * When loading a resource via reference, GraphQL needs to know the type of the resource.
 * @param resource - The loaded resource.
 * @returns The GraphQL type of the resource.
 */
function resolveTypeByReference(resource: Resource | undefined): string | undefined {
  const resourceType = resource?.resourceType;
  if (!resourceType) {
    return undefined;
  }

  return (getGraphQLOutputType(resourceType) as GraphQLObjectType).name;
}
