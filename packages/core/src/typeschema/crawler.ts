import { Resource } from '@medplum/fhirtypes';
import { GetTypedPropertyValueOptions, getTypedPropertyValue, toTypedValue } from '../fhirpath/utils';
import { isResource, TypedValue } from '../types';
import { arrayify, isLowerCase } from '../utils';
import { getDataType, InternalTypeSchema } from './types';

export interface ResourceVisitor {
  onEnterObject?: (path: string, value: TypedValueWithExpression, schema: InternalTypeSchema) => void;
  onExitObject?: (path: string, value: TypedValueWithExpression, schema: InternalTypeSchema) => void;
  onEnterResource?: (path: string, value: TypedValueWithExpression, schema: InternalTypeSchema) => void;
  onExitResource?: (path: string, value: TypedValueWithExpression, schema: InternalTypeSchema) => void;
  visitProperty?: (
    parent: TypedValueWithExpression,
    key: string,
    path: string,
    propertyValues: (TypedValueWithExpression | TypedValueWithExpression[])[],
    schema: InternalTypeSchema
  ) => void;
}

export function crawlResource(
  resource: Resource,
  visitor: ResourceVisitor,
  schema?: InternalTypeSchema,
  initialPath?: string
): void {
  new ResourceCrawler(resource, visitor, schema, initialPath).crawl();
}

class ResourceCrawler {
  private readonly rootResource: Resource;
  private readonly visitor: ResourceVisitor;
  private readonly schema: InternalTypeSchema;
  private readonly initialPath: string;

  constructor(rootResource: Resource, visitor: ResourceVisitor, schema?: InternalTypeSchema, initialPath?: string) {
    this.rootResource = rootResource;
    this.visitor = visitor;

    if (schema) {
      this.schema = schema;
    } else {
      this.schema = getDataType(rootResource.resourceType);
    }

    if (initialPath) {
      this.initialPath = initialPath;
    } else {
      this.initialPath = rootResource.resourceType;
    }
  }

  crawl(): void {
    this.crawlObject(
      { ...toTypedValue(this.rootResource), expression: this.initialPath },
      this.schema,
      this.initialPath
    );
  }

  private crawlObject(obj: TypedValueWithExpression, schema: InternalTypeSchema, path: string): void {
    const objIsResource = isResource(obj.value);

    if (objIsResource && this.visitor.onEnterResource) {
      this.visitor.onEnterResource(path, obj, schema);
    }

    if (this.visitor.onEnterObject) {
      this.visitor.onEnterObject(path, obj, schema);
    }

    for (const key of Object.keys(schema.elements)) {
      this.crawlProperty(obj, key, schema, `${path}.${key}`);
    }

    if (this.visitor.onExitObject) {
      this.visitor.onExitObject(path, obj, schema);
    }

    if (objIsResource && this.visitor.onExitResource) {
      this.visitor.onExitResource(path, obj, schema);
    }
  }

  private crawlProperty(parent: TypedValueWithExpression, key: string, schema: InternalTypeSchema, path: string): void {
    const propertyValues = getNestedProperty(parent, key, { withExpression: true });
    if (this.visitor.visitProperty) {
      this.visitor.visitProperty(parent, key, path, propertyValues, schema);
    }

    for (const propertyValue of propertyValues) {
      if (propertyValue) {
        for (const value of arrayify(propertyValue) as TypedValueWithExpression[]) {
          this.crawlPropertyValue(value, path);
        }
      }
    }
  }

  private crawlPropertyValue(value: TypedValueWithExpression, path: string): void {
    if (!isLowerCase(value.type.charAt(0))) {
      // Recursively crawl as the expected data type
      const type = getDataType(value.type);
      this.crawlObject(value, type, path);
    }
  }
}

export function getNestedProperty(
  value: TypedValueWithExpression | undefined,
  key: string,
  options: { profileUrl?: string; withExpression: true }
): (TypedValueWithExpression | TypedValueWithExpression[])[];
export function getNestedProperty(
  value: TypedValue | undefined,
  key: string,
  options?: { profileUrl?: string; withExpression?: false }
): (TypedValue | TypedValue[] | undefined)[];
export function getNestedProperty(
  value: TypedValue | undefined,
  key: string,
  options?: { profileUrl?: string; withExpression?: boolean }
): (TypedValue | TypedValue[] | undefined)[] {
  if (value === undefined) {
    return [undefined];
  }

  if (key === '$this') {
    return [value];
  }

  const propertyGetter = options?.withExpression ? getTypedPropertyValueWithExpression : getTypedPropertyValue;

  const [firstProp, ...nestedProps] = key.split('.');
  let propertyValues = [propertyGetter(value, firstProp, options)];
  for (const prop of nestedProps) {
    const next = [];
    for (const current of propertyValues) {
      if (Array.isArray(current)) {
        for (const element of current) {
          next.push(propertyGetter(element, prop, options));
        }
      } else if (options?.withExpression && current && current.value !== undefined) {
        next.push(propertyGetter(current, prop, options));
      } else if (!options?.withExpression && current !== undefined) {
        next.push(propertyGetter(current, prop, options));
      }
    }
    propertyValues = next;
  }
  return propertyValues;
}

function getTypedPropertyValueWithExpression(
  input: TypedValue | TypedValueWithExpression,
  path: string,
  options?: GetTypedPropertyValueOptions
): TypedValueWithExpression[] | TypedValueWithExpression {
  const parentExpression = (input as TypedValueWithExpression).expression;
  return withExpression(getTypedPropertyValue(input, path, options), parentExpression, path);
}

export type TypedValueWithExpression = TypedValue & { expression: string };

function withExpression(
  tv: TypedValue | TypedValue[] | undefined,
  parentExpression: string | undefined,
  key: string
): TypedValueWithExpression | TypedValueWithExpression[] {
  const parentPrefix = parentExpression ? parentExpression + '.' : '';

  if (tv === undefined) {
    return { type: 'undefined', value: undefined, expression: `${parentPrefix}${key}` };
  }

  if (Array.isArray(tv)) {
    return tv.map((v, idx) => ({
      ...v,
      expression: `${parentPrefix}${key}[${idx}]`,
    }));
  }

  return { ...tv, expression: `${parentPrefix}${key}` };
}
