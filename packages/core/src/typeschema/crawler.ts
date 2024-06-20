import { Resource } from '@medplum/fhirtypes';
import { GetTypedPropertyValueOptions, getTypedPropertyValue, toTypedValue } from '../fhirpath/utils';
import { isResource, TypedValue } from '../types';
import { arrayify, isLowerCase } from '../utils';
import { getDataType, InternalTypeSchema } from './types';

export interface ResourceVisitor {
  onEnterObject?: (path: string, value: TypedValueWithPath, schema: InternalTypeSchema) => void;
  onExitObject?: (path: string, value: TypedValueWithPath, schema: InternalTypeSchema) => void;
  onEnterResource?: (path: string, value: TypedValueWithPath, schema: InternalTypeSchema) => void;
  onExitResource?: (path: string, value: TypedValueWithPath, schema: InternalTypeSchema) => void;
  visitProperty: (
    parent: TypedValueWithPath,
    key: string,
    path: string,
    propertyValues: (TypedValueWithPath | TypedValueWithPath[])[],
    schema: InternalTypeSchema
  ) => void;
}

export interface AsyncResourceVisitor {
  onEnterObject?: (path: string, value: TypedValueWithPath, schema: InternalTypeSchema) => Promise<void>;
  onExitObject?: (path: string, value: TypedValueWithPath, schema: InternalTypeSchema) => Promise<void>;
  onEnterResource?: (path: string, value: TypedValueWithPath, schema: InternalTypeSchema) => Promise<void>;
  onExitResource?: (path: string, value: TypedValueWithPath, schema: InternalTypeSchema) => Promise<void>;
  visitPropertyAsync: (
    parent: TypedValueWithPath,
    key: string,
    path: string,
    value: TypedValueWithPath | TypedValueWithPath[],
    schema: InternalTypeSchema
  ) => Promise<void>;
}

function isSchema(obj: InternalTypeSchema | ResourceCrawlerOptions): obj is InternalTypeSchema {
  return 'elements' in obj;
}

function isAsync(visitor: ResourceVisitor | AsyncResourceVisitor): visitor is AsyncResourceVisitor {
  return Boolean((visitor as AsyncResourceVisitor).visitPropertyAsync);
}

export function crawlResource(
  resource: Resource,
  visitor: ResourceVisitor,
  schema?: InternalTypeSchema,
  initialPath?: string
): void;
export function crawlResource(
  resource: Resource,
  visitor: AsyncResourceVisitor,
  options: ResourceCrawlerOptions
): Promise<void>;
export function crawlResource(
  resource: Resource,
  visitor: ResourceVisitor | AsyncResourceVisitor,
  schema?: InternalTypeSchema | ResourceCrawlerOptions,
  initialPath?: string
): Promise<void> | void {
  let options: ResourceCrawlerOptions | undefined;
  if (schema && isSchema(schema)) {
    options = { schema, initialPath };
  } else {
    options = schema;
  }

  if (isAsync(visitor)) {
    return new AsyncResourceCrawler(resource, visitor, options).crawl();
  } else {
    new ResourceCrawler(resource, visitor, options).crawl();
    return undefined;
  }
}

export type ResourceCrawlerOptions = {
  skipMissingProperties?: boolean;
  schema?: InternalTypeSchema;
  initialPath?: string;
};

class ResourceCrawler {
  private readonly rootResource: Resource;
  private readonly visitor: ResourceVisitor;
  private readonly schema: InternalTypeSchema;
  private readonly initialPath: string;
  private readonly excludeMissingProperties?: boolean;

  constructor(rootResource: Resource, visitor: ResourceVisitor, options?: ResourceCrawlerOptions) {
    this.rootResource = rootResource;
    this.visitor = visitor;

    this.schema = options?.schema ?? getDataType(rootResource.resourceType);
    this.initialPath = options?.initialPath ?? rootResource.resourceType;
    this.excludeMissingProperties = options?.skipMissingProperties;
  }

  crawl(): void {
    this.crawlObject({ ...toTypedValue(this.rootResource), path: this.initialPath }, this.schema, this.initialPath);
  }

  private crawlObject(obj: TypedValueWithPath, schema: InternalTypeSchema, path: string): void {
    const objIsResource = isResource(obj.value);

    if (objIsResource && this.visitor.onEnterResource) {
      this.visitor.onEnterResource(path, obj, schema);
    }

    if (this.visitor.onEnterObject) {
      this.visitor.onEnterObject(path, obj, schema);
    }

    if (this.excludeMissingProperties) {
      for (const key of Object.keys(obj.value)) {
        this.crawlProperty(obj, key, schema, `${path}.${key}`);
      }
    } else {
      for (const key of Object.keys(schema.elements)) {
        this.crawlProperty(obj, key, schema, `${path}.${key}`);
      }
    }

    if (this.visitor.onExitObject) {
      this.visitor.onExitObject(path, obj, schema);
    }

    if (objIsResource && this.visitor.onExitResource) {
      this.visitor.onExitResource(path, obj, schema);
    }
  }

  private crawlProperty(parent: TypedValueWithPath, key: string, schema: InternalTypeSchema, path: string): void {
    const propertyValues = getNestedProperty(parent, key, { withPath: true });
    if (this.visitor.visitProperty) {
      this.visitor.visitProperty(parent, key, path, propertyValues, schema);
    }

    for (const propertyValue of propertyValues) {
      if (propertyValue) {
        for (const value of arrayify(propertyValue) as TypedValueWithPath[]) {
          this.crawlPropertyValue(value, path);
        }
      }
    }
  }

  private crawlPropertyValue(value: TypedValueWithPath, path: string): void {
    if (!isLowerCase(value.type.charAt(0))) {
      // Recursively crawl as the expected data type
      const type = getDataType(value.type);
      this.crawlObject(value, type, path);
    }
  }
}

class AsyncResourceCrawler {
  private readonly rootResource: Resource;
  private readonly visitor: AsyncResourceVisitor;
  private readonly schema: InternalTypeSchema;
  private readonly initialPath: string;
  private readonly excludeMissingProperties?: boolean;

  constructor(rootResource: Resource, visitor: AsyncResourceVisitor, options?: ResourceCrawlerOptions) {
    this.rootResource = rootResource;
    this.visitor = visitor;

    this.schema = options?.schema ?? getDataType(rootResource.resourceType);
    this.initialPath = options?.initialPath ?? rootResource.resourceType;
    this.excludeMissingProperties = options?.skipMissingProperties;
  }

  async crawl(): Promise<void> {
    return this.crawlObject(
      { ...toTypedValue(this.rootResource), path: this.initialPath },
      this.schema,
      this.initialPath
    );
  }

  private async crawlObject(obj: TypedValueWithPath, schema: InternalTypeSchema, path: string): Promise<void> {
    const objIsResource = isResource(obj.value);

    if (objIsResource && this.visitor.onEnterResource) {
      await this.visitor.onEnterResource(path, obj, schema);
    }

    if (this.visitor.onEnterObject) {
      await this.visitor.onEnterObject(path, obj, schema);
    }

    if (this.excludeMissingProperties) {
      for (const key of Object.keys(obj.value)) {
        await this.crawlProperty(obj, key, schema, `${path}.${key}`);
      }
    } else {
      for (const key of Object.keys(schema.elements)) {
        await this.crawlProperty(obj, key, schema, `${path}.${key}`);
      }
    }

    if (this.visitor.onExitObject) {
      await this.visitor.onExitObject(path, obj, schema);
    }

    if (objIsResource && this.visitor.onExitResource) {
      await this.visitor.onExitResource(path, obj, schema);
    }
  }

  private async crawlProperty(
    parent: TypedValueWithPath,
    key: string,
    schema: InternalTypeSchema,
    path: string
  ): Promise<void> {
    const propertyValues = getNestedProperty(parent, key, { withPath: true });
    if (this.visitor.visitPropertyAsync) {
      for (const propertyValue of propertyValues) {
        await this.visitor.visitPropertyAsync(parent, key, path, propertyValue, schema);
      }
    }

    for (const propertyValue of propertyValues) {
      if (propertyValue) {
        for (const value of arrayify(propertyValue) as TypedValueWithPath[]) {
          await this.crawlPropertyValue(value, path);
        }
      }
    }
  }

  private async crawlPropertyValue(value: TypedValueWithPath, path: string): Promise<void> {
    if (!isLowerCase(value.type.charAt(0))) {
      // Recursively crawl as the expected data type
      const type = getDataType(value.type);
      await this.crawlObject(value, type, path);
    }
  }
}

export function getNestedProperty(
  value: TypedValueWithPath | undefined,
  key: string,
  options: { profileUrl?: string; withPath: true }
): (TypedValueWithPath | TypedValueWithPath[])[];
export function getNestedProperty(
  value: TypedValue | undefined,
  key: string,
  options?: { profileUrl?: string; withPath?: false }
): (TypedValue | TypedValue[] | undefined)[];
export function getNestedProperty(
  value: TypedValue | undefined,
  key: string,
  options?: { profileUrl?: string; withPath?: boolean }
): (TypedValue | TypedValue[] | undefined)[] {
  if (value === undefined) {
    return [undefined];
  }

  if (key === '$this') {
    return [value];
  }

  const propertyGetter = options?.withPath ? getTypedPropertyValueWithPath : getTypedPropertyValue;

  const [firstProp, ...nestedProps] = key.split('.');
  let propertyValues = [propertyGetter(value, firstProp, options)];
  for (const prop of nestedProps) {
    const next = [];
    for (const current of propertyValues) {
      if (Array.isArray(current)) {
        for (const element of current) {
          next.push(propertyGetter(element, prop, options));
        }
      } else if (options?.withPath && current && current.value !== undefined) {
        next.push(propertyGetter(current, prop, options));
      } else if (!options?.withPath && current !== undefined) {
        next.push(propertyGetter(current, prop, options));
      }
    }
    propertyValues = next;
  }
  return propertyValues;
}

export function getTypedPropertyValueWithPath(
  input: TypedValue | TypedValueWithPath,
  path: string,
  options?: GetTypedPropertyValueOptions
): TypedValueWithPath[] | TypedValueWithPath {
  const parentPath = (input as TypedValueWithPath).path;
  return withPath(getTypedPropertyValue(input, path, options), parentPath, path);
}

export type TypedValueWithPath = TypedValue & { path: string };

function withPath(
  tv: TypedValue | TypedValue[] | undefined,
  parentPath: string | undefined,
  key: string
): TypedValueWithPath | TypedValueWithPath[] {
  const parentPrefix = parentPath ? parentPath + '.' : '';

  if (tv === undefined) {
    return { type: 'undefined', value: undefined, path: `${parentPrefix}${key}` };
  }

  if (Array.isArray(tv)) {
    return tv.map((v, idx) => ({
      ...v,
      path: `${parentPrefix}${key}[${idx}]`,
    }));
  }

  return { ...tv, path: `${parentPrefix}${key}` };
}
