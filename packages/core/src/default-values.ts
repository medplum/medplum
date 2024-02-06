import { Resource } from '@medplum/fhirtypes';
import { InternalSchemaElement, InternalTypeSchema, SliceDefinition, SliceDiscriminator } from './typeschema/types';
import { arrayify, capitalize, deepClone, isObject, isPopulated } from './utils';
import { getNestedProperty } from './typeschema/crawler';
import { TypedValue } from './types';
import { matchDiscriminant } from './typeschema/validation';
import {
  ElementsContextType,
  SchemaCrawler,
  SchemaVisitor,
  VisitorSliceDefinition,
  VisitorSlicingRules,
} from './schema-crawler';

type ConsoleDebug = typeof console.debug;

export const SLICE_NAME_KEY = '__sliceName';

export function applyDefaultValuesToResource(
  resource: Resource,
  schema: InternalTypeSchema,
  options?: { debug?: boolean }
): Resource {
  const debugMode = Boolean(options?.debug);
  const visitor = new DefaultValueVisitor(resource, resource.resourceType, 'resource');
  const crawler = new SchemaCrawler(schema, visitor);
  crawler.crawlResource(debugMode);
  return visitor.getDefaultValue();
}

type ValueContext = {
  type: 'resource' | 'element' | 'slice';
  path: string;
  values: any[];
};

export class DefaultValueVisitor implements SchemaVisitor {
  private outputRootValue: any;

  private readonly schemaStack: InternalTypeSchema[];
  private valueStack: ValueContext[];

  private debugMode: boolean = true;

  constructor(rootValue: any, path: string, type: ValueContext['type']) {
    this.schemaStack = [];
    this.valueStack = [];

    this.setRootValue(rootValue, path, type);
  }

  private get schema(): InternalTypeSchema {
    return this.schemaStack[this.schemaStack.length - 1];
  }

  private get value(): ValueContext {
    return this.valueStack[this.valueStack.length - 1];
  }

  private debug(...data: any[]): void {
    if (this.debugMode) {
      console.debug(`[ApplyDefaults][${this.schema.name}]`, ...data);
    }
  }

  setRootValue(rootValue: any, rootPath: string, rootType: ValueContext['type']): void {
    this.outputRootValue = deepClone(rootValue);
    this.valueStack = [
      {
        type: rootType,
        path: rootPath,
        values: [this.outputRootValue],
      },
    ];
  }

  onEnterSchema(schema: InternalTypeSchema): void {
    this.schemaStack.push(schema);
  }

  onExitSchema(): void {
    this.schemaStack.pop();
  }

  onEnterElement(path: string, element: InternalSchemaElement, elementsContext: ElementsContextType): void {
    this.debug(`onEnterElement ${path} ${element.min > 0 ? `min: ${element.min}` : ''}`);

    const parentValues = this.value.values;
    const parentPath = this.value.path;
    const key = getPathDifference(parentPath, path);
    const elementValues: any[] = [];

    for (const parentValue of parentValues) {
      if (parentValue === undefined) {
        continue;
      }

      // eld-6: Fixed value may only be specified if there is one type
      // eld-7: Pattern may only be specified if there is one type
      if (element.type.length > 1) {
        if (element.fixed || element.pattern) {
          this.debug(`skipping fixed/pattern for ${path} since the element has multiple types`);
        }
        continue;
      }

      const parentArray: any[] = Array.isArray(parentValue) ? parentValue : [parentValue];
      for (const parent of parentArray) {
        const existingValue = getValueAtKey(parent, key, element, elementsContext.elements);
        if (element.min > 0 && existingValue === undefined) {
          if (isComplexTypeCode(element.type[0].code)) {
            if (element.isArray) {
              setValueAtKey(parent, [Object.create(null)], key, element);
            } else {
              setValueAtKey(parent, Object.create(null), key, element);
            }
          }
        }
        applyFixedOrPatternValue(parent, key, element, elementsContext.elements, true);

        const elementValue = getValueAtKey(parent, key, element, elementsContext.elements);
        if (elementValue !== undefined) {
          elementValues.push(elementValue);
        }
      }
    }

    this.valueStack.push({
      type: 'element',
      path: path,
      values: elementValues,
    });
  }

  onExitElement(path: string, element: InternalSchemaElement, elementsContext: ElementsContextType): void {
    const elementValueContext = this.valueStack.pop();
    if (!elementValueContext) {
      throw new Error('Expected value context to exist when exiting element');
    }
    this.debug(`onExitElement ${path}\n${JSON.stringify(elementValueContext.values)}`);

    for (const parentValue of this.value.values) {
      const elementValue = getValueAtKey(
        parentValue,
        getPathDifference(this.value.path, path),
        element,
        elementsContext.elements
      );

      // remove empty items from arrays
      if (Array.isArray(elementValue)) {
        for (let i = elementValue.length - 1; i >= 0; i--) {
          const value = elementValue[i];
          if (!isPopulated(value)) {
            this.debug(`empty value removed from array: ${JSON.stringify(value)}`);
            elementValue.splice(i, 1);
          }
        }
      }

      // remove empty items from parent
      if (elementValue !== undefined && !isPopulated(elementValue)) {
        setValueAtKey(parentValue, undefined, getPathDifference(this.value.path, path), element);
      }
    }
  }

  onEnterSlice(path: string, slice: VisitorSliceDefinition, slicing: VisitorSlicingRules): void {
    this.debug(`onEnterSlice[${slice.name}] ${path} ${slice.min > 0 ? `min: ${slice.min}` : ''}`);

    const elementValues = this.value.values;
    const sliceValues: any[] = [];

    for (const elementValue of elementValues) {
      if (elementValue === undefined) {
        continue;
      }

      if (!Array.isArray(elementValue)) {
        throw new Error('Expected array value for sliced element');
      }

      const matchingItems: any[] = [];
      for (const arrayItem of elementValue) {
        const sliceName = getValueSliceName(
          arrayItem,
          [slice],
          slicing.discriminator,
          slice.typeSchema,
          this.schema.url
        );
        if (sliceName === slice.name) {
          matchingItems.push(arrayItem);
        }
      }

      // Make sure at least slice.min values exist
      if (matchingItems.length < slice.min) {
        // Slices of simple types not very well supported
        if (isComplexTypeCode(slice.type[0].code)) {
          const emptySliceValue = Object.create(null);
          elementValue.push(emptySliceValue);
          matchingItems.push(emptySliceValue);
        }
      }
      sliceValues.push(matchingItems);
    }

    this.valueStack.push({
      type: 'slice',
      path,
      values: sliceValues,
    });
  }

  onExitSlice(path: string, slice: VisitorSliceDefinition): void {
    const sliceValueContext = this.valueStack.pop();
    if (!sliceValueContext) {
      throw new Error('Expected value context to exist in onExitSlice');
    }

    for (const sliceValueArray of sliceValueContext.values) {
      for (let i = sliceValueArray.length - 1; i >= 0; i--) {
        const sliceValue = sliceValueArray[i];
        if (SLICE_NAME_KEY in sliceValue) {
          delete sliceValue[SLICE_NAME_KEY];
        }
      }
    }

    this.debug(`onExitSlice[${slice.name}]`, slice.name, JSON.stringify(sliceValueContext.values));
    this.debug('parentValue', JSON.stringify(this.value.values));
  }

  getDefaultValue(): Resource {
    return this.outputRootValue;
  }
}

function isDiscriminatorComponentMatch(
  typedValue: TypedValue,
  discriminator: SliceDiscriminator,
  slice: SliceDefinition,
  sliceSchema: InternalTypeSchema | undefined,
  profileUrl: string | undefined
): boolean {
  const nestedProp = getNestedProperty(typedValue, discriminator.path, { profileUrl: sliceSchema?.url ?? profileUrl });

  if (nestedProp) {
    const elementList = sliceSchema?.elements ?? slice.elements;
    return arrayify(nestedProp)?.some((v: any) => matchDiscriminant(v, discriminator, slice, elementList)) ?? false;
  }

  console.assert(false, 'getNestedProperty[%s] in isDiscriminatorComponentMatch missed', discriminator.path);

  return false;
}

function getValueSliceName(
  value: any,
  slices: SliceDefinition[],
  discriminators: SliceDiscriminator[],
  sliceSchema: InternalTypeSchema | undefined,
  profileUrl: string | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (isPopulated(value[SLICE_NAME_KEY])) {
    return value[SLICE_NAME_KEY] as string;
  }

  for (const slice of slices) {
    const sliceType = sliceSchema?.name ?? slice.type?.[0].code ?? 'TODO';
    const typedValue: TypedValue = {
      value,
      type: sliceType,
    };
    if (discriminators.every((d) => isDiscriminatorComponentMatch(typedValue, d, slice, sliceSchema, profileUrl))) {
      return slice.name;
    }
  }
  return undefined;
}

function getPathDifference(parentPath: string, path: string): string {
  if (!path.startsWith(parentPath)) {
    throw new Error(`Expected ${path} to be prefixed by ${parentPath}`);
  }
  return path.slice(parentPath.length + 1);
}

function setValueAtKey(parent: any, value: any, key: string, element: InternalSchemaElement): void {
  if (key.includes('.')) {
    throw new Error('key cannot be nested');
  }

  let resolvedKey = key;

  if (key.includes('[x]')) {
    const code = element.type[0].code;
    resolvedKey = key.replace('[x]', capitalize(code));
  }

  if (value === undefined) {
    delete parent[resolvedKey];
  } else {
    parent[resolvedKey] = value;
  }
}

function getValueAtKey(
  value: object,
  key: string,
  element: InternalSchemaElement,
  elements: Record<string, InternalSchemaElement>
): any {
  if (!isPopulated(value)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((valueItem) => getValueAtKey(valueItem, key, element, elements));
  }

  if (!isObject(value)) {
    throw new Error('Expected value to be an object');
  }

  const keyParts = key.split('.');
  let last: any = value;
  let answer;
  for (let i = 0; i < keyParts.length; i++) {
    let keyPart = keyParts[i];
    if (keyPart.includes('[x]')) {
      const keyPartElem = elements[keyParts.slice(0, i + 1).join('.')];
      // should this loop through all possible types instead of using type[0]?
      const code = keyPartElem.type[0].code;
      keyPart = keyPart.replace('[x]', capitalize(code));
    }

    // final key part
    if (i === keyParts.length - 1) {
      if (Array.isArray(last)) {
        answer = last.map((item) => item[keyPart]);
      } else {
        answer = last[keyPart];
      }
      continue;
    }

    // intermediate key part
    if (Array.isArray(last)) {
      last = last.map((lastItem) => {
        return lastItem[keyPart];
      });
    } else if (isObject(last)) {
      if (!(keyPart in last) || last[keyPart] === undefined) {
        return undefined;
      }
      last = last[keyPart];
    } else {
      throw new Error('Expected value at intermediate key part to be an array or object');
    }
  }

  return answer;
}

function applyFixedOrPatternValue(
  inputValue: any,
  key: string,
  element: InternalSchemaElement,
  elements: Record<string, InternalSchemaElement>,
  debugMode: boolean
): any {
  if (!(element.fixed || element.pattern)) {
    return inputValue;
  }

  if (Array.isArray(inputValue)) {
    return inputValue.map((iv) => applyFixedOrPatternValue(iv, key, element, elements, debugMode));
  }

  if (inputValue === undefined || inputValue === null) {
    inputValue = Object.create(null);
  }

  const outputValue = inputValue;

  const debug: ConsoleDebug = debugMode ? console.debug : () => undefined;

  debug(
    `applyFixedPattern key: ${key} ${element.fixed ? 'fixed' : 'pattern'}: ${JSON.stringify((element.fixed ?? element.pattern)?.value)}`
  );
  debug(`begin`, JSON.stringify(inputValue, undefined, 2));

  const keyParts = key.split('.');
  let last: any = outputValue;
  for (let i = 0; i < keyParts.length; i++) {
    let keyPart = keyParts[i];
    if (keyPart.includes('[x]')) {
      const keyPartElem = elements[keyParts.slice(0, i + 1).join('.')];
      const code = keyPartElem.type[0].code;
      keyPart = keyPart.replace('[x]', capitalize(code));
    }

    if (i === keyParts.length - 1) {
      const lastArray = Array.isArray(last) ? last : [last];
      for (const item of lastArray) {
        if (element.fixed) {
          item[keyPart] ??= element.fixed.value;
        } else if (element.pattern) {
          item[keyPart] = applyPattern(item[keyPart], element.pattern.value, debug);
        }
      }
    } else {
      if (!(keyPart in last)) {
        const elementKey = keyParts.slice(0, i + 1).join('.');
        debug(`creating empty value for ${elementKey}`);
        last[keyPart] = elements[elementKey].isArray ? [Object.create(null)] : Object.create(null);
      }
      debug('setting last to', JSON.stringify(last[keyPart]));
      last = last[keyPart];
    }
  }
  debug(`done`, JSON.stringify(outputValue, undefined, 2));

  return outputValue;
}

function applyPattern(existingValue: any, pattern: any, debug: ConsoleDebug): any {
  try {
    const result = existingValue === undefined ? undefined : deepClone(existingValue);

    if (Array.isArray(pattern)) {
      if (Array.isArray(existingValue) || existingValue === undefined || existingValue === null) {
        if ((existingValue?.length ?? 0) > 0) {
          throw new Error(
            'Cannot yet apply a pattern to a non-empty array since that would require considering cardinality and slicing'
          );
        } else {
          return pattern;
        }
      } else {
        throw new Error('Type of value incompatible with array pattern');
      }
    } else if (isObject(pattern)) {
      if (isObject(existingValue) || existingValue === undefined || existingValue === null) {
        const resultObj = (result ?? Object.create(null)) as { [key: string]: any };
        for (const key of Object.keys(pattern)) {
          const output = applyPattern(resultObj[key], pattern[key], debug);
          debug(
            `object set ${key}`,
            JSON.stringify({ existing: resultObj[key] ?? null, pattern: pattern[key], output }, undefined, 2)
          );
          resultObj[key] = applyPattern(resultObj[key], pattern[key], debug);
        }
        return resultObj;
      } else {
        throw new Error('Type of value incompatible with object pattern');
      }
    }

    throw new Error('Unexpected type of pattern');
  } catch (ex) {
    return existingValue;
  }
}

function isComplexTypeCode(code: string): boolean {
  return code.startsWith(code[0].toUpperCase());
}
