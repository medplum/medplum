import { Resource } from '@medplum/fhirtypes';
import { GetTypedPropertyValueOptions, getTypedPropertyValue, toTypedValue } from '../fhirpath/utils';
import { isResource, TypedValue } from '../types';
import { arrayify, isLowerCase } from '../utils';
import { getDataType, InternalTypeSchema } from './types';

export interface ResourceVisitor {
  onEnterObject?: (path: string, value: TypedValueWithIndexedPath, schema: InternalTypeSchema) => void;
  onExitObject?: (path: string, value: TypedValueWithIndexedPath, schema: InternalTypeSchema) => void;
  onEnterResource?: (path: string, value: TypedValueWithIndexedPath, schema: InternalTypeSchema) => void;
  onExitResource?: (path: string, value: TypedValueWithIndexedPath, schema: InternalTypeSchema) => void;
  visitProperty?: (
    parent: TypedValueWithIndexedPath,
    key: string,
    path: string,
    propertyValues: (TypedValueWithIndexedPath | TypedValueWithIndexedPath[])[],
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
      { ...toTypedValue(this.rootResource), indexedPath: this.initialPath },
      this.schema,
      this.initialPath
    );
  }

  private crawlObject(obj: TypedValueWithIndexedPath, schema: InternalTypeSchema, path: string): void {
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

  private crawlProperty(
    parent: TypedValueWithIndexedPath,
    key: string,
    schema: InternalTypeSchema,
    path: string
  ): void {
    const propertyValues = getNestedProperty(parent, key, { withIndexedPath: true });
    if (this.visitor.visitProperty) {
      this.visitor.visitProperty(parent, key, path, propertyValues, schema);
    }

    for (const propertyValue of propertyValues) {
      if (propertyValue) {
        for (const value of arrayify(propertyValue) as TypedValueWithIndexedPath[]) {
          this.crawlPropertyValue(value, path);
        }
      }
    }
  }

  private crawlPropertyValue(value: TypedValueWithIndexedPath, path: string): void {
    if (!isLowerCase(value.type.charAt(0))) {
      // Recursively crawl as the expected data type
      const type = getDataType(value.type);
      this.crawlObject(value, type, path);
    }
  }
}

export function getNestedProperty(
  value: TypedValueWithIndexedPath | undefined,
  key: string,
  options: { profileUrl?: string; withIndexedPath: true }
): (TypedValueWithIndexedPath | TypedValueWithIndexedPath[])[];
export function getNestedProperty(
  value: TypedValue | undefined,
  key: string,
  options?: { profileUrl?: string; withIndexedPath?: false }
): (TypedValue | TypedValue[] | undefined)[];
export function getNestedProperty(
  value: TypedValue | undefined,
  key: string,
  options?: { profileUrl?: string; withIndexedPath?: boolean }
): (TypedValue | TypedValue[] | undefined)[] {
  if (value === undefined) {
    return [undefined];
  }

  if (key === '$this') {
    return [value];
  }

  const propertyGetter = options?.withIndexedPath ? getTypedPropertyValueWithIndexedPath : getTypedPropertyValue;

  const [firstProp, ...nestedProps] = key.split('.');
  let propertyValues = [propertyGetter(value, firstProp, options)];
  for (const prop of nestedProps) {
    const next = [];
    for (const current of propertyValues) {
      if (Array.isArray(current)) {
        for (const element of current) {
          next.push(propertyGetter(element, prop, options));
        }
      } else if (options?.withIndexedPath && current && current.value !== undefined) {
        next.push(propertyGetter(current, prop, options));
      } else if (!options?.withIndexedPath && current !== undefined) {
        next.push(propertyGetter(current, prop, options));
      }
    }
    propertyValues = next;
  }
  return propertyValues;
}

function getTypedPropertyValueWithIndexedPath(
  input: TypedValue | TypedValueWithIndexedPath,
  path: string,
  options?: GetTypedPropertyValueOptions
): TypedValueWithIndexedPath[] | TypedValueWithIndexedPath {
  const parentIndexedPath = (input as TypedValueWithIndexedPath).indexedPath;
  return withIndexedPath(getTypedPropertyValue(input, path, options), parentIndexedPath, path);
}

export type TypedValueWithIndexedPath = TypedValue & { indexedPath: string };

function withIndexedPath(
  tv: TypedValue | TypedValue[] | undefined,
  parentIndexedPath: string | undefined,
  key: string
): TypedValueWithIndexedPath | TypedValueWithIndexedPath[] {
  const parentPrefix = parentIndexedPath ? parentIndexedPath + '.' : '';

  if (tv === undefined) {
    return { type: 'undefined', value: undefined, indexedPath: `${parentPrefix}${key}` };
  }

  if (Array.isArray(tv)) {
    return tv.map((v, idx) => ({
      ...v,
      indexedPath: `${parentPrefix}${key}[${idx}]`,
    }));
  }

  return { ...tv, indexedPath: `${parentPrefix}${key}` };
}
