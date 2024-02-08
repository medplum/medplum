import { Resource } from '@medplum/fhirtypes';
import {
  ElementsContextType,
  SchemaCrawler,
  SchemaVisitor,
  VisitorSliceDefinition,
  VisitorSlicingRules,
} from './schema-crawler';
import { TypedValue } from './types';
import { getNestedProperty } from './typeschema/crawler';
import {
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDefinition,
  SliceDiscriminator,
  SlicingRules,
} from './typeschema/types';
import { matchDiscriminant } from './typeschema/validation';
import {
  arrayify,
  capitalize,
  deepClone,
  getPathDifference,
  isComplexTypeCode,
  isObject,
  isPopulated,
  splitOnceRight,
} from './utils';

/**
 * Used when an array entry, typically an empty one, needs to be assigned
 * to a given slice even though it doesn't match the slice's discriminator.
 */
const SLICE_NAME_KEY = '__sliceName';

export type ApplyDefautlValuesToResourceOptions = {
  debug?: boolean;
};

/**
 * Adds default values to `resource` based on the supplied `schema`. Default values includes all required fixed and pattern
 * values specified on elements in the schema. If an element has a fixed/pattern value but is optional, i.e.
 * `element.min === 0`, the default value is not added.
 *
 * @param resource - The resource to which default values should be added.
 * @param schema - The schema to use for adding default values.
 * @param options - (optional) additional options
 * @returns A clone of `resource` with default values added.
 */
export function applyDefaultValuesToResource(
  resource: Resource,
  schema: InternalTypeSchema,
  options?: ApplyDefautlValuesToResourceOptions
): Resource {
  const visitor = new DefaultValueVisitor(resource, resource.resourceType, 'resource', options?.debug);
  const crawler = new SchemaCrawler(schema, visitor);
  crawler.crawlResource();
  return visitor.getDefaultValue();
}

/**
 * Adds default values to `existingValue` for the given `key` and its children. If `key` is undefined,
 * default values are added to all elements in `elements`. Default values consist of all fixed and pattern
 * values defined in the relevant elements.
 * @param existingValue - The
 * @param elements - The elements to which default values should be added.
 * @param key - (optional) The key of the element(s) for which default values should be added. Elements with nested
 * keys are also included. If undefined, default values for all elements are added.
 * @returns `existingValue` with default values added
 */
export function applyDefaultValuesToElement(
  existingValue: object,
  elements: Record<string, InternalSchemaElement>,
  key?: string
): object {
  for (const [elementKey, element] of Object.entries(elements)) {
    if (key === undefined || key === elementKey) {
      applyFixedOrPatternValue(existingValue, elementKey, element, elements, false);
    } else if (elementKey.startsWith(key + '.')) {
      const keyDifference = getPathDifference(key, elementKey);
      if (keyDifference === undefined) {
        throw new Error(`Expected ${elementKey} to be prefixed by ${key}`);
      }
      applyFixedOrPatternValue(existingValue, keyDifference, element, elements, false);
    }
  }

  return existingValue;
}

export function applyDefaultValuesToElementWithVisitor(
  existingValue: any,
  path: string,
  element: InternalSchemaElement,
  elements: Record<string, InternalSchemaElement>,
  schema: InternalTypeSchema,
  options?: { debug?: boolean }
): any {
  const inputValue: object = existingValue ?? Object.create(null);

  const [parentPath, key] = splitOnceRight(path, '.');
  const parent = Object.create(null);
  setValueAtKey(parent, inputValue, key, element);

  const visitor = new DefaultValueVisitor(parent, parentPath, 'element', options?.debug);
  const crawler = new SchemaCrawler(schema, visitor, elements);
  crawler.crawlElement(element, key, parentPath);
  const modifiedContainer = visitor.getDefaultValue();

  return getValueAtKey(modifiedContainer, key, element, elements);
}

export function getDefaultValuesForNewSliceEntry(
  key: string,
  slice: SliceDefinition,
  slicing: SlicingRules,
  schema: InternalTypeSchema,
  options?: { debug?: boolean }
): Resource {
  const visitor = new DefaultValueVisitor([{ [SLICE_NAME_KEY]: slice.name }], slice.path, 'element', options?.debug);
  const crawler = new SchemaCrawler(schema, visitor);
  crawler.crawlSlice(key, slice, slicing);
  return visitor.getDefaultValue()[0];
}

type ValueContext = {
  type: 'resource' | 'element' | 'slice';
  path: string;
  values: any[];
};

class DefaultValueVisitor implements SchemaVisitor {
  private rootValue: any;

  private readonly schemaStack: InternalTypeSchema[];
  private readonly valueStack: ValueContext[];

  private debugMode: boolean;

  constructor(rootValue: any, path: string, type: ValueContext['type'], debug?: boolean) {
    this.schemaStack = [];
    this.valueStack = [];
    this.debugMode = Boolean(debug);

    this.rootValue = deepClone(rootValue);
    this.valueStack.splice(0, this.valueStack.length, {
      type,
      path,
      values: [this.rootValue],
    });
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

  onEnterSchema(schema: InternalTypeSchema): void {
    this.schemaStack.push(schema);
  }

  onExitSchema(): void {
    this.schemaStack.pop();
  }

  onEnterElement(path: string, element: InternalSchemaElement, elementsContext: ElementsContextType): void {
    this.debug(`onEnterElement ${path} ${element.min > 0 ? `min: ${element.min}` : ''}`);
    if (path !== element.path) {
      this.debug(`onEnterElement path mismatch: ${path} !== ${element.path}`);
    }

    const parentValues = this.value.values;
    const parentPath = this.value.path;
    const key = getPathDifference(parentPath, path);
    if (key === undefined) {
      throw new Error(`Expected ${path} to be prefixed by ${parentPath}`);
    }
    const elementValues: any[] = [];

    for (const parentValue of parentValues) {
      if (parentValue === undefined) {
        continue;
      }

      // eld-6: Fixed value may only be specified if there is one type
      // eld-7: Pattern may only be specified if there is one type
      if (element.type.length > 1) {
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
        applyFixedOrPatternValue(parent, key, element, elementsContext.elements, this.debugMode);

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
      const key = getPathDifference(this.value.path, path);
      if (key === undefined) {
        throw new Error(`Expected ${path} to be prefixed by ${this.value.path}`);
      }

      const elementValue = getValueAtKey(parentValue, key, element, elementsContext.elements);

      // remove empty items from arrays
      if (Array.isArray(elementValue)) {
        for (let i = elementValue.length - 1; i >= 0; i--) {
          const value = elementValue[i];
          if (!isPopulated(value)) {
            elementValue.splice(i, 1);
          }
        }
      }

      if (!isPopulated(elementValue)) {
        // setting undefined to delete the key
        setValueAtKey(parentValue, undefined, key, element);
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
        let sliceName: string | undefined = arrayItem[SLICE_NAME_KEY];

        if (!sliceName) {
          sliceName = getValueSliceName(arrayItem, [slice], slicing.discriminator, slice.typeSchema, this.schema.url);
        }

        if (sliceName === slice.name) {
          matchingItems.push(arrayItem);
        }
      }

      // Make sure at least slice.min values exist
      for (let i = matchingItems.length; i < slice.min; i++) {
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

  onExitSlice(_path: string, slice: VisitorSliceDefinition): void {
    const sliceValuesContext = this.valueStack.pop();
    if (!sliceValuesContext) {
      throw new Error('Expected value context to exist in onExitSlice');
    }

    for (const sliceValueArray of sliceValuesContext.values) {
      for (let i = sliceValueArray.length - 1; i >= 0; i--) {
        const sliceValue = sliceValueArray[i];
        if (SLICE_NAME_KEY in sliceValue) {
          delete sliceValue[SLICE_NAME_KEY];
        }
      }
    }

    this.debug(`onExitSlice[${slice.name}]`, slice.name, JSON.stringify(sliceValuesContext.values));
  }

  getDefaultValue(): any {
    return this.rootValue;
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
    throw new Error('Expected value to be an array or object');
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
  debug: boolean
): any {
  if (!(element.fixed || element.pattern)) {
    return inputValue;
  }

  if (Array.isArray(inputValue)) {
    return inputValue.map((iv) => applyFixedOrPatternValue(iv, key, element, elements, debug));
  }

  if (inputValue === undefined || inputValue === null) {
    inputValue = Object.create(null);
  }

  const outputValue = inputValue;

  if (debug) {
    console.debug(
      `applyFixedPattern key: ${key} ${element.fixed ? 'fixed' : 'pattern'}: ${JSON.stringify((element.fixed ?? element.pattern)?.value)}`
    );
    console.debug(`begin`, JSON.stringify(inputValue, undefined, 2));
  }

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
          item[keyPart] = applyPattern(item[keyPart], element.pattern.value);
        }
      }
    } else {
      if (!(keyPart in last)) {
        const elementKey = keyParts.slice(0, i + 1).join('.');
        last[keyPart] = elements[elementKey].isArray ? [Object.create(null)] : Object.create(null);
      }
      last = last[keyPart];
    }
  }
  if (debug) {
    console.debug(`done`, JSON.stringify(outputValue, undefined, 2));
  }

  return outputValue;
}

function applyPattern(existingValue: any, pattern: any): any {
  try {
    const result = existingValue === undefined ? undefined : deepClone(existingValue);

    if (Array.isArray(pattern)) {
      if (Array.isArray(existingValue) || existingValue === undefined || existingValue === null) {
        if ((existingValue?.length ?? 0) > 0) {
          throw new Error(
            'Cannot yet apply a pattern to a non-empty array since that would require considering cardinality and slicing'
          );
        } else {
          return deepClone(pattern);
        }
      } else {
        throw new Error('Type of value incompatible with array pattern');
      }
    } else if (isObject(pattern)) {
      if (isObject(existingValue) || existingValue === undefined || existingValue === null) {
        const resultObj = (result ?? Object.create(null)) as { [key: string]: any };
        for (const key of Object.keys(pattern)) {
          resultObj[key] = applyPattern(resultObj[key], pattern[key]);
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
