// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { GetTypedPropertyValueOptions } from '../fhirpath/utils';
import { getTypedPropertyValue } from '../fhirpath/utils';
import type { TypedValue } from '../types';
import { isResource } from '../types';
import { arrayify } from '../utils';
import type { InternalTypeSchema } from './types';
import { getDataType } from './types';
import { isPrimitiveType } from './validation';

export interface CrawlerVisitor {
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

export interface AsyncCrawlerVisitor {
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

export interface CrawlerOptions {
  skipMissingProperties?: boolean;
  schema?: InternalTypeSchema;
  initialPath?: string;
}

/**
 * Crawls the typed value synchronously.
 * @param typedValue - The typed value to crawl.
 * @param visitor - The visitor functions to apply while crawling.
 * @param options - Options for how to crawl the typed value.
 */
export function crawlTypedValue(typedValue: TypedValue, visitor: CrawlerVisitor, options?: CrawlerOptions): void {
  new Crawler(typedValue, visitor, options).crawl();
}

/**
 * Crawls the typed value asynchronously.
 * @param typedValue - The typed value to crawl.
 * @param visitor - The visitor functions to apply while crawling.
 * @param options - Options for how to crawl the typed value.
 * @returns Promise to crawl the typed value.
 */
export function crawlTypedValueAsync(
  typedValue: TypedValue,
  visitor: AsyncCrawlerVisitor,
  options?: CrawlerOptions
): Promise<void> {
  return new AsyncCrawler(typedValue, visitor, options).crawl();
}

class Crawler {
  private readonly root: TypedValue;
  private readonly visitor: CrawlerVisitor;
  private readonly schema: InternalTypeSchema;
  private readonly initialPath: string;
  private readonly excludeMissingProperties?: boolean;

  constructor(root: TypedValue, visitor: CrawlerVisitor, options?: CrawlerOptions) {
    this.root = root;
    this.visitor = visitor;

    this.schema = options?.schema ?? getDataType(root.type);
    this.initialPath = options?.initialPath ?? this.schema.path;
    this.excludeMissingProperties = options?.skipMissingProperties;
  }

  crawl(): void {
    this.crawlObject({ ...this.root, path: this.initialPath }, this.schema, this.initialPath);
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
          this.crawlPropertyValue(value, path, schema);
        }
      }
    }
  }

  private crawlPropertyValue(value: TypedValueWithPath, path: string, schema: InternalTypeSchema): void {
    if (!isPrimitiveType(value.type)) {
      // Recursively crawl as the expected data type
      //TODO Is this the correct way to consider schema.innerTypes?
      const type = schema.innerTypes?.find((t) => t.name === value.type) ?? getDataType(value.type);
      this.crawlObject(value, type, path);
    }
  }
}

class AsyncCrawler {
  private readonly root: TypedValue;
  private readonly visitor: AsyncCrawlerVisitor;
  private readonly schema: InternalTypeSchema;
  private readonly initialPath: string;
  private readonly excludeMissingProperties?: boolean;

  constructor(root: TypedValue, visitor: AsyncCrawlerVisitor, options?: CrawlerOptions) {
    this.root = root;
    this.visitor = visitor;

    this.schema = options?.schema ?? getDataType(root.type);
    this.initialPath = options?.initialPath ?? this.schema.path;
    this.excludeMissingProperties = options?.skipMissingProperties;
  }

  async crawl(): Promise<void> {
    return this.crawlObject({ ...this.root, path: this.initialPath }, this.schema, this.initialPath);
  }

  private async crawlObject(obj: TypedValueWithPath, schema: InternalTypeSchema, path: string): Promise<void> {
    const objIsResource = isResource(obj.value);

    if (objIsResource && this.visitor.onEnterResource) {
      await this.visitor.onEnterResource(path, obj, schema);
    }

    if (this.visitor.onEnterObject) {
      await this.visitor.onEnterObject(path, obj, schema);
    }

    if (this.excludeMissingProperties && obj.value) {
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
    if (!isPrimitiveType(value.type)) {
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
      } else if (options?.withPath && current?.value !== undefined) {
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
